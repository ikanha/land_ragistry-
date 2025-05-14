
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Gateway, Wallets } = require("fabric-network");
const FabricCAServices = require("fabric-ca-client");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Configuration ---
const ccpPathOrg1 = path.resolve(__dirname, "..", "land-registry-fabric", "config", "ccp-Org1.yaml");
const ccpPathOrg2 = path.resolve(__dirname, "..", "land-registry-fabric", "config", "ccp-Org2.yaml");
const walletPath = path.join(__dirname, "wallet");

const channelName = "landchannel";
const chaincodeName = "landregistrycc";

// --- Helper Functions ---

async function getGateway(orgMSP, ccpPath) {
    const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: orgMSP + "User", // Default user, will need proper user management
        discovery: { enabled: true, asLocalhost: true },
    });
    return gateway;
}

async function getContract(gateway) {
    const network = await gateway.getNetwork(channelName);
    return network.getContract(chaincodeName);
}

// Function to enroll admin and register user (simplified for now)
// In a real app, this would be more robust and secure
async function enrollAdminAndRegisterUser(orgName, orgMSP, ccpPath, caName) {
    try {
        const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));
        const caInfo = ccp.certificateAuthorities[caName];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Check if admin already enrolled
        const adminIdentity = await wallet.get("admin" + orgMSP);
        if (!adminIdentity) {
            console.log(`Enrolling admin for ${orgMSP}...`);
            const enrollment = await ca.enroll({ enrollmentID: "admin", enrollmentSecret: "adminpw" });
            const x509Identity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes(),
                },
                mspId: orgMSP,
                type: "X.509",
            };
            await wallet.put("admin" + orgMSP, x509Identity);
            console.log(`Successfully enrolled admin user "admin${orgMSP}" and imported it into the wallet`);
        }

        // Check if app user already registered
        const userIdentity = await wallet.get(orgMSP + "User");
        if (!userIdentity) {
            console.log(`Registering user for ${orgMSP}...`);
            const adminUser = await wallet.get("admin" + orgMSP);
            if (!adminUser) {
                console.error(`Admin user for ${orgMSP} not found. Run enrollAdmin first.`);
                return;
            }
            const provider = wallet.getProviderRegistry().getProvider(adminUser.type);
            const adminContext = await provider.getUserContext(adminUser, "admin" + orgMSP);
            
            // Register the user, give attributes for role-based access
            // The roles 'gov_registrar' and 'registry_officer' should match those checked in chaincode
            let userRole = "";
            if (orgMSP === "Org1MSP") userRole = "gov_registrar"; // Government Department
            if (orgMSP === "Org2MSP") userRole = "registry_officer"; // Land Registry Office

            await ca.register({
                affiliation: orgName.toLowerCase() + ".department1", // e.g. org1.department1
                enrollmentID: orgMSP + "User",
                role: "client",
                attrs: [{ name: "role", value: userRole, ecert: true }]
            }, adminContext);

            const enrollment = await ca.enroll({ enrollmentID: orgMSP + "User", enrollmentSecret: orgMSP + "Userpw" }); // Assuming user password is userID + "pw"
            const x509Identity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes(),
                },
                mspId: orgMSP,
                type: "X.509",
            };
            await wallet.put(orgMSP + "User", x509Identity);
            console.log(`Successfully registered and enrolled user "${orgMSP}User" with role "${userRole}" and imported it into the wallet`);
        }
    } catch (error) {
        console.error(`Failed to enroll admin or register user for ${orgMSP}: ${error}`);
        // process.exit(1); // Comment out for now to allow server to start even if one CA fails
    }
}

// --- API Endpoints ---

// Endpoint to check server status
app.get("/api/status", (req, res) => {
    res.json({ status: "Server is running", timestamp: new Date().toISOString() });
});

// Generic chaincode invoke endpoint
app.post("/api/invoke/:orgMSP/:functionName", async (req, res) => {
    const { orgMSP, functionName } = req.params;
    const args = req.body.args || []; // Arguments for the chaincode function
    let ccpPath;

    if (orgMSP === "Org1MSP") {
        ccpPath = ccpPathOrg1;
    } else if (orgMSP === "Org2MSP") {
        ccpPath = ccpPathOrg2;
    } else {
        return res.status(400).json({ error: "Invalid organization MSP ID" });
    }

    let gateway;
    try {
        gateway = await getGateway(orgMSP, ccpPath);
        const contract = await getContract(gateway);
        console.log(`Submitting transaction: ${functionName} with arguments: ${args.join(", ")}`);
        const result = await contract.submitTransaction(functionName, ...args);
        console.log(`Transaction successful. Result: ${result.toString()}`);
        res.json({ success: true, message: `Transaction ${functionName} successful.`, result: result.toString() });
    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (gateway) {
            gateway.disconnect();
        }
    }
});

// Generic chaincode query endpoint
app.get("/api/query/:orgMSP/:functionName", async (req, res) => {
    const { orgMSP, functionName } = req.params;
    const args = req.query.args ? JSON.parse(req.query.args) : []; // Arguments from query string
    let ccpPath;

    if (orgMSP === "Org1MSP") {
        ccpPath = ccpPathOrg1;
    } else if (orgMSP === "Org2MSP") {
        ccpPath = ccpPathOrg2;
    } else {
        return res.status(400).json({ error: "Invalid organization MSP ID" });
    }

    let gateway;
    try {
        gateway = await getGateway(orgMSP, ccpPath);
        const contract = await getContract(gateway);
        console.log(`Evaluating transaction: ${functionName} with arguments: ${args.join(", ")}`);
        const result = await contract.evaluateTransaction(functionName, ...args);
        console.log(`Query successful. Result: ${result.toString()}`);
        res.json({ success: true, result: JSON.parse(result.toString()) });
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (gateway) {
            gateway.disconnect();
        }
    }
});

// Serve a simple HTML frontend (placeholder)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Initialize and Start Server ---
async function initialize() {
    // Create wallet directory if it doesn_t exist
    if (!fs.existsSync(walletPath)) {
        fs.mkdirSync(walletPath);
    }
    // Enroll admin and register user for Org1
    await enrollAdminAndRegisterUser("Org1", "Org1MSP", ccpPathOrg1, "ca.org1.example.com");
    // Enroll admin and register user for Org2
    await enrollAdminAndRegisterUser("Org2", "Org2MSP", ccpPathOrg2, "ca.org2.example.com");

    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log("Ensure Hyperledger Fabric network is running and chaincode is deployed.");
        console.log(`Org1 CCP Path: ${ccpPathOrg1}`);
        console.log(`Org2 CCP Path: ${ccpPathOrg2}`);
        console.log(`Wallet Path: ${walletPath}`);
    });
}

initialize();

