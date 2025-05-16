
'use strict';

const { Contract, Context } = require('fabric-contract-api');
const ClientIdentity = require('fabric-shim').ClientIdentity;

// Define objectType names for prefixing keys in the world state
const landAssetType = 'LandAsset';

class LandRegistryContext extends Context {
    constructor() {
        super();
    }
}

class LandRegistryContract extends Contract {

    constructor() {
        super('org.landreg.landregistry'); // Unique namespace for the contract
    }

    createContext() {
        return new LandRegistryContext();
    }

    async beforeTransaction(ctx) {
        // This function is called before any transaction function.
        // Can be used for logging, access control, etc.
        const txId = ctx.stub.getTxID();
        console.log(`[${txId}] Transaction started: ${ctx.stub.getFunctionAndParameters().fcn}`);
        
        // Example of getting client identity attributes for RBAC
        // let cid = new ClientIdentity(ctx.stub);
        // let userRole = cid.getAttributeValue('role'); // Assuming 'role' attribute is set in user's certificate
        // console.log(`[${txId}] User Role: ${userRole}`);
    }

    async afterTransaction(ctx, result) {
        // This function is called after any transaction function.
        const txId = ctx.stub.getTxID();
        console.log(`[${txId}] Transaction completed: ${ctx.stub.getFunctionAndParameters().fcn}`);
    }

    _checkRole(cid, allowedRoles) {
        const userRole = cid.getAttributeValue('role');
        if (!userRole || !allowedRoles.includes(userRole)) {
            throw new Error(`Caller does not have the required role. Allowed roles: ${allowedRoles.join(', ')}. Caller role: ${userRole}`);
        }
        // Further check based on MSP ID if needed
        // const mspId = cid.getMSPID();
        // if (mspId !== 'Org1MSP' && userRole === 'gov_registrar') { throw new Error... }
    }

    /**
     * Initializes the ledger with some sample data (for testing purposes).
     * @param {Context} ctx the transaction context
     */
    async initLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        const lands = [
            {
                landID: 'L001',
                owner: 'Alice Wonderland',
                area: '500 sqm',
                location: '123 Main St, Anytown',
                marketValue: 100000,
                documentHash: 'initial_hash_L001',
                status: 'Registered',
                registrationDate: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
            },
            {
                landID: 'L002',
                owner: 'Bob The Builder',
                area: '1200 sqm',
                location: '456 Oak Ave, Anytown',
                marketValue: 250000,
                documentHash: 'initial_hash_L002',
                status: 'Registered',
                registrationDate: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
            },
        ];

        for (const land of lands) {
            const landKey = ctx.stub.createCompositeKey(landAssetType, [land.landID]);
            await ctx.stub.putState(landKey, Buffer.from(JSON.stringify(land)));
            console.info(`Asset ${land.landID} initialized`);
        }
        console.info('============= END : Initialize Ledger ===========');
        return { success: true, message: 'Ledger initialized with sample data.' };
    }

    /**
     * Registers a new land parcel.
     * Only callable by authorized users from the Government Department (e.g., role 'gov_registrar').
     * @param {Context} ctx The transaction context.
     * @param {string} landID Unique ID for the land.
     * @param {string} owner Details of the owner.
     * @param {string} area Area of the land.
     * @param {string} location Location of the land.
     * @param {number} marketValue Market value of the land.
     * @param {string} documentHash Hash of supporting legal documents.
     */
    async registerLand(ctx, landID, owner, area, location, marketValue, documentHash) {
        const cid = new ClientIdentity(ctx.stub);
        this._checkRole(cid, ['gov_registrar']); // Example role check
        if (cid.getMSPID() !== 'Org1MSP') { // Assuming Org1 is Government Department
             throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to register land. Must be from Org1MSP.`);
        }

        const landKey = ctx.stub.createCompositeKey(landAssetType, [landID]);
        const existingLand = await ctx.stub.getState(landKey);
        if (existingLand && existingLand.length > 0) {
            throw new Error(`Land with ID ${landID} already exists.`);
        }

        const newLand = {
            landID,
            owner,
            area,
            location,
            marketValue: parseFloat(marketValue),
            documentHash,
            status: 'Registered',
            registrationDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            registeredBy: cid.getID(), // Store the registrar's identity
            registrarMSPID: cid.getMSPID()
        };

        await ctx.stub.putState(landKey, Buffer.from(JSON.stringify(newLand)));
        console.info(`Land ${landID} registered by ${cid.getID()}`);
        return { success: true, landID: landID, message: `Land ${landID} registered successfully.` };
    }

    /**
     * Initiates the transfer of ownership for a land parcel.
     * Only callable by authorized users from the Government Department (e.g., role 'gov_registrar').
     * @param {Context} ctx The transaction context.
     * @param {string} landID The ID of the land to transfer.
     * @param {string} newOwner Details of the new owner.
     */
    async initiateTransfer(ctx, landID, newOwner) {
        const cid = new ClientIdentity(ctx.stub);
        this._checkRole(cid, ['gov_registrar']);
         if (cid.getMSPID() !== 'Org1MSP') {
             throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to initiate transfers. Must be from Org1MSP.`);
        }

        const landKey = ctx.stub.createCompositeKey(landAssetType, [landID]);
        const landBytes = await ctx.stub.getState(landKey);
        if (!landBytes || landBytes.length === 0) {
            throw new Error(`Land with ID ${landID} does not exist.`);
        }

        const land = JSON.parse(landBytes.toString());
        if (land.status !== 'Registered' && land.status !== 'TransferRejected') {
            throw new Error(`Land ${landID} is not in a state where transfer can be initiated. Current status: ${land.status}`);
        }

        land.status = 'TransferPending';
        land.pendingNewOwner = newOwner;
        land.lastUpdated = new Date().toISOString();
        land.transferInitiatedBy = cid.getID();

        await ctx.stub.putState(landKey, Buffer.from(JSON.stringify(land)));
        console.info(`Transfer initiated for land ${landID} to ${newOwner} by ${cid.getID()}`);
        return { success: true, landID: landID, message: `Ownership transfer for land ${landID} initiated to ${newOwner}.` };
    }

    /**
     * Approves an initiated land ownership transfer.
     * Only callable by authorized users from the Land Registry Office (e.g., role 'registry_officer').
     * @param {Context} ctx The transaction context.
     * @param {string} landID The ID of the land for which transfer is to be approved.
     */
    async approveTransfer(ctx, landID) {
        const cid = new ClientIdentity(ctx.stub);
        this._checkRole(cid, ['registry_officer']);
        if (cid.getMSPID() !== 'Org2MSP') { // Assuming Org2 is Land Registry Office
             throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to approve transfers. Must be from Org2MSP.`);
        }

        const landKey = ctx.stub.createCompositeKey(landAssetType, [landID]);
        const landBytes = await ctx.stub.getState(landKey);
        if (!landBytes || landBytes.length === 0) {
            throw new Error(`Land with ID ${landID} does not exist.`);
        }

        const land = JSON.parse(landBytes.toString());
        if (land.status !== 'TransferPending') {
            throw new Error(`Land ${landID} is not pending transfer. Current status: ${land.status}`);
        }

        land.owner = land.pendingNewOwner;
        delete land.pendingNewOwner;
        land.status = 'Transferred';
        land.lastUpdated = new Date().toISOString();
        land.transferApprovedBy = cid.getID();

        await ctx.stub.putState(landKey, Buffer.from(JSON.stringify(land)));
        console.info(`Transfer approved for land ${landID}. New owner: ${land.owner}. Approved by: ${cid.getID()}`);
        return { success: true, landID: landID, message: `Ownership transfer for land ${landID} approved. New owner: ${land.owner}.` };
    }

    /**
     * Rejects an initiated land ownership transfer.
     * Only callable by authorized users from the Land Registry Office (e.g., role 'registry_officer').
     * @param {Context} ctx The transaction context.
     * @param {string} landID The ID of the land for which transfer is to be rejected.
     * @param {string} reason Reason for rejection.
     */
    async rejectTransfer(ctx, landID, reason) {
        const cid = new ClientIdentity(ctx.stub);
        this._checkRole(cid, ['registry_officer']);
        if (cid.getMSPID() !== 'Org2MSP') {
             throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to reject transfers. Must be from Org2MSP.`);
        }

        const landKey = ctx.stub.createCompositeKey(landAssetType, [landID]);
        const landBytes = await ctx.stub.getState(landKey);
        if (!landBytes || landBytes.length === 0) {
            throw new Error(`Land with ID ${landID} does not exist.`);
        }

        const land = JSON.parse(landBytes.toString());
        if (land.status !== 'TransferPending') {
            throw new Error(`Land ${landID} is not pending transfer. Current status: ${land.status}`);
        }

        land.status = 'TransferRejected';
        land.rejectionReason = reason;
        delete land.pendingNewOwner;
        land.lastUpdated = new Date().toISOString();
        land.transferRejectedBy = cid.getID();

        await ctx.stub.putState(landKey, Buffer.from(JSON.stringify(land)));
        console.info(`Transfer rejected for land ${landID}. Reason: ${reason}. Rejected by: ${cid.getID()}`);
        return { success: true, landID: landID, message: `Ownership transfer for land ${landID} rejected. Reason: ${reason}.` };
    }

    /**
     * Queries a land parcel by its ID.
     * Accessible by authorized users from both organizations.
     * @param {Context} ctx The transaction context.
     * @param {string} landID The ID of the land to query.
     */
    async queryLand(ctx, landID) {
        const cid = new ClientIdentity(ctx.stub);
        // Allow any authenticated user from Org1 or Org2 to query
        if (cid.getMSPID() !== 'Org1MSP' && cid.getMSPID() !== 'Org2MSP') {
            throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to query land data.`);
        }

        const landKey = ctx.stub.createCompositeKey(landAssetType, [landID]);
        const landBytes = await ctx.stub.getState(landKey);
        if (!landBytes || landBytes.length === 0) {
            throw new Error(`Land with ID ${landID} does not exist.`);
        }
        console.info(`Query for land ${landID} successful.`);
        return landBytes.toString();
    }

    /**
     * Queries land parcels by owner.
     * Accessible by authorized users from both organizations.
     * This is a more complex query and assumes CouchDB is used as the state database.
     * @param {Context} ctx The transaction context.
     * @param {string} owner The owner to query land parcels for.
     */
    async queryLandByOwner(ctx, owner) {
        const cid = new ClientIdentity(ctx.stub);
        if (cid.getMSPID() !== 'Org1MSP' && cid.getMSPID() !== 'Org2MSP') {
            throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to query land data.`);
        }

        const queryString = {
            selector: {
                owner: owner,
                // docType: landAssetType // If you add a docType field to your assets
            },
            // use_index: ['_design/indexOwnerDoc', 'indexOwner'] // Optional: specify an index for performance
        };

        const iterator = await ctx.stub.getQueryResult(JSON.stringify(queryString));
        const allResults = [];
        let res = await iterator.next();
        while (!res.done) {
            if (res.value && res.value.value.toString()) {
                const jsonRes = {};
                console.log(res.value.value.toString('utf8'));
                jsonRes.Key = res.value.key;
                try {
                    jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    console.log(err);
                    jsonRes.Record = res.value.value.toString('utf8');
                }
                allResults.push(jsonRes);
            }
            res = await iterator.next();
        }
        await iterator.close();
        console.info(`Query for lands by owner ${owner} successful.`);
        return JSON.stringify(allResults);
    }

    /**
     * Retrieves the history of a land parcel.
     * Accessible by authorized users from both organizations.
     * @param {Context} ctx The transaction context.
     * @param {string} landID The ID of the land to get history for.
     */
    async getLandHistory(ctx, landID) {
        const cid = new ClientIdentity(ctx.stub);
        if (cid.getMSPID() !== 'Org1MSP' && cid.getMSPID() !== 'Org2MSP') {
            throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to query land history.`);
        }

        const landKey = ctx.stub.createCompositeKey(landAssetType, [landID]);
        const iterator = await ctx.stub.getHistoryForKey(landKey);

        const allResults = [];
        let res = await iterator.next();
        while (!res.done) {
            if (res.value && res.value.value.toString()) {
                const historyItem = {};
                historyItem.TxId = res.value.tx_id;
                historyItem.Timestamp = new Date(res.value.timestamp.seconds.low * 1000).toISOString();
                historyItem.IsDelete = res.value.is_delete.toString();
                try {
                    historyItem.Value = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    historyItem.Value = res.value.value.toString('utf8');
                }
                allResults.push(historyItem);
            }
            res = await iterator.next();
        }
        await iterator.close();
        console.info(`History query for land ${landID} successful.`);
        return JSON.stringify(allResults);
    }

    /**
     * Verifies a document hash against the stored hash for a land parcel.
     * @param {Context} ctx The transaction context.
     * @param {string} landID The ID of the land.
     * @param {string} hashToVerify The hash to verify.
     */
    async verifyDocument(ctx, landID, hashToVerify) {
        const cid = new ClientIdentity(ctx.stub);
        if (cid.getMSPID() !== 'Org1MSP' && cid.getMSPID() !== 'Org2MSP') {
            throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized to verify documents.`);
        }

        const landKey = ctx.stub.createCompositeKey(landAssetType, [landID]);
        const landBytes = await ctx.stub.getState(landKey);
        if (!landBytes || landBytes.length === 0) {
            throw new Error(`Land with ID ${landID} does not exist.`);
        }

        const land = JSON.parse(landBytes.toString());
        if (land.documentHash === hashToVerify) {
            console.info(`Document hash verified for land ${landID}.`);
            return { success: true, verified: true, message: 'Document hash matches the stored hash.' };
        }
        console.warn(`Document hash verification failed for land ${landID}.`);
        return { success: true, verified: false, message: 'Document hash does not match the stored hash.' };
    }

    // Example of a function that checks if a user has a specific attribute
    async checkAttribute(ctx, attributeName) {
        const cid = new ClientIdentity(ctx.stub);
        const attributeValue = cid.getAttributeValue(attributeName);
        if (!attributeValue) {
            throw new Error(`Attribute ${attributeName} not found for the client.`);
        }
        return { attributeName: attributeName, attributeValue: attributeValue };
    }

    // Example of getting the client's MSP ID
    async getClientMSPID(ctx) {
        const cid = new ClientIdentity(ctx.stub);
        const mspID = cid.getMSPID();
        return { mspID: mspID };
    }
}

module.exports = LandRegistryContract;

