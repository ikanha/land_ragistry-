# Role-Based Access Control (RBAC) Integration Notes

This document outlines how Role-Based Access Control (RBAC) is implemented and integrated into the Land Registry Management System.

## 1. Overview

RBAC is enforced at two primary levels:

1.  **Blockchain Level (Chaincode):** The chaincode (`landregistrycontract.js`) performs the ultimate authorization checks based on the invoking user's identity attributes (specifically, their role and MSP ID).
2.  **Application Level (Web Server & Client Simulation):** The Node.js web server (`server.js`) is responsible for interacting with the Fabric network using appropriate user identities. The frontend (`index.html`) provides a simulation mechanism for selecting a user role, which dictates the identity used by the backend.

## 2. Role Definition and Assignment

User roles are defined as attributes within their X.509 certificates. These attributes are assigned during the user registration process with the Fabric Certificate Authority (CA).

*   **In `server.js` (Function: `enrollAdminAndRegisterUser`):**
    *   When a user is registered (e.g., `Org1MSPUser`, `Org2MSPUser`), a `role` attribute is embedded into their certificate.
    *   `Org1MSPUser` (representing a Government Department user) is assigned the role `gov_registrar`.
        ```javascript
        // For Org1MSP (Government Department)
        attrs: [{ name: "role", value: "gov_registrar", ecert: true }]
        ```
    *   `Org2MSPUser` (representing a Land Registry Office user) is assigned the role `registry_officer`.
        ```javascript
        // For Org2MSP (Land Registry Office)
        attrs: [{ name: "role", value: "registry_officer", ecert: true }]
        ```
    *   These roles (`gov_registrar`, `registry_officer`) directly correspond to the roles expected and checked by the chaincode.

## 3. Chaincode-Level RBAC Enforcement

*   **In `landregistrycontract.js`:**
    *   The `ClientIdentity` class from `fabric-shim` is used to retrieve the invoking user's attributes and MSP ID: `new ClientIdentity(ctx.stub)`.
    *   The `_checkRole(cid, allowedRoles)` helper function verifies if the user's `role` attribute (obtained via `cid.getAttributeValue('role')`) is present in the list of allowed roles for a given function.
    *   Each transactional function (e.g., `registerLand`, `approveTransfer`) performs checks based on both the user's role and their MSP ID (`cid.getMSPID()`).
        *   Example: `registerLand` requires the `gov_registrar` role AND the caller to be from `Org1MSP`.
            ```javascript
            // In registerLand function
            const cid = new ClientIdentity(ctx.stub);
            this._checkRole(cid, ["gov_registrar"]);
            if (cid.getMSPID() !== "Org1MSP") { 
                 throw new Error(`Caller from MSP ${cid.getMSPID()} is not authorized...`);
            }
            ```
        *   Query functions typically check for authorized MSP IDs (`Org1MSP` or `Org2MSP`).

## 4. Web Application Level - Identity Management and Simulation

*   **Frontend (`public/index.html`):**
    *   A dropdown menu allows the user to simulate selecting a role: "Government Department (Org1)" or "Land Registry Office (Org2)".
    *   This selection determines the `selectedOrgMSP` variable in the frontend JavaScript.
    *   Based on `selectedOrgMSP`, API calls are directed to backend endpoints that include the Org's MSP ID (e.g., `/api/invoke/Org1MSP/registerLand`).
*   **Backend (`server.js`):**
    *   API endpoints are structured like `/api/invoke/:orgMSP/:functionName` and `/api/query/:orgMSP/:functionName`.
    *   The `:orgMSP` parameter from the URL (e.g., `Org1MSP` or `Org2MSP`) is used by the backend to:
        1.  Select the correct Connection Profile (`ccp-Org1.yaml` or `ccp-Org2.yaml`).
        2.  Determine the Fabric user identity to use for connecting to the gateway. It uses a pre-registered user identity: `orgMSP + "User"` (e.g., `Org1MSPUser`, `Org2MSPUser`).
            ```javascript
            // In getGateway function
            await gateway.connect(ccp, {
                wallet,
                identity: orgMSP + "User", // Uses the role-specific user
                discovery: { enabled: true, asLocalhost: true },
            });
            ```
    *   This ensures that when a user simulates being from "Government Department (Org1)", the backend uses the `Org1MSPUser` identity, which possesses the `gov_registrar` role. The same applies to `Org2MSPUser` and the `registry_officer` role.

## 5. Integration and Validation

The integration of RBAC relies on the consistent use of these role attributes from the point of user identity creation (via Fabric CA and `server.js`) through to chaincode execution.

*   The current setup effectively allows testing of the chaincode's RBAC logic because the backend uses identities that have the correct roles and MSP affiliations based on the frontend simulation.
*   For example, if the frontend, simulating `Org1MSPUser`, attempts to call `approveTransfer` (an Org2 function), the backend will use `Org1MSPUser`. The chaincode will then correctly deny this request because `Org1MSPUser` does not have the `registry_officer` role and is not from `Org2MSP`.

This system ensures that actions are restricted based on roles defined within the Hyperledger Fabric network, providing a secure and auditable way to manage permissions. The web application facilitates the use of these role-based identities for interaction with the blockchain.

Further enhancements in a production system would involve a full-fledged authentication system in the web application (e.g., username/password login) that securely maps web users to their corresponding Fabric identities, rather than the current simulation model. However, for the current scope, the simulation is adequate for demonstrating and testing the RBAC capabilities enforced by the blockchain layer.
