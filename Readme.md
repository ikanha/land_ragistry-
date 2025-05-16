# System Architecture for Land Registry Management System

## 1. Introduction

This document outlines the system architecture for the Land Registry Management System, a permissioned blockchain application built using Hyperledger Fabric. The architecture is designed to meet the functional and non-functional requirements specified in the `system_requirements.md` document, ensuring a secure, transparent, and efficient platform for managing land records.

## 2. Hyperledger Fabric Network Architecture

The core of the system is a Hyperledger Fabric network comprising two main organizations: the Government Department (Org1) and the Land Registry Office (Org2).

### 2.1. Organizations

*   **Org1: Government Department:** Responsible for registering new land parcels and initiating ownership transfers. Hosts its own peers and a dedicated Certificate Authority (CA).
*   **Org2: Land Registry Office:** Responsible for verifying and approving/rejecting ownership transfers. Hosts its own peers and a dedicated Certificate Authority (CA).

### 2.2. Network Components

*   **Peers:**
    *   Each organization (Org1 and Org2) will have at least one peer node. For redundancy and high availability, two peers per organization are recommended in a production setup.
    *   Peers will host copies of the ledger and the chaincode (smart contracts).
    *   One peer in each organization will be designated as an anchor peer to facilitate cross-organization communication.
*   **Orderer Service:**
    *   A Raft-based ordering service will be used to ensure consensus on the order of transactions. For initial development, a single-node Raft orderer can be used. For production, a multi-node Raft setup (e.g., 3 or 5 nodes) is recommended for fault tolerance. The ordering service can be managed by a neutral third party or jointly by the participating organizations.
*   **Certificate Authorities (CAs):**
    *   Each organization (Org1 and Org2) will have its own Fabric CA server (e.g., `ca.org1.example.com`, `ca.org2.example.com`).
    *   These CAs will be responsible for issuing and managing digital certificates (X.509) for users, administrators, and peer/orderer nodes within their respective organizations. This forms the basis of the system's identity management and role-based access control.
*   **Channels:**
    *   A single application channel (e.g., `landchannel`) will be created for all land registry transactions. Both Org1 and Org2 peers will join this channel.
    *   This channel will have its own ledger, isolated from other potential channels on the network.

### 2.3. Ledger

*   Each peer on `landchannel` will maintain a copy of the ledger.
*   The ledger consists of two parts:
    *   **World State:** A database (e.g., CouchDB or LevelDB) that stores the current value of all assets (land records). Using CouchDB allows for rich queries on the ledger data.
    *   **Blockchain:** A transaction log that records all transactions immutably.

## 3. Chaincode (Smart Contract) Architecture

The chaincode will encapsulate the business logic for land registration, ownership transfer, and data verification.

### 3.1. Chaincode Name and Language

*   **Name:** `landregistrycc`
*   **Language:** Go, Node.js, or Java (Node.js is often preferred for web integration ease, Go for performance).

### 3.2. Data Structures (as defined in requirements)

*   **`LandAsset`:**
    *   `LandID`: string (unique identifier, primary key)
    *   `Owner`: string (current owner's identifier/details)
    *   `Area`: string
    *   `Location`: string
    *   `MarketValue`: float
    *   `DocumentHash`: string (hash of off-chain legal documents)
    *   `Status`: string (e.g., "Registered", "TransferPending", "Transferred")
    *   `RegistrationDate`: string (timestamp)
    *   `LastUpdated`: string (timestamp)
*   **Implicit Transaction History:** Hyperledger Fabric automatically provides a history of changes for each key (LandID). Specific transaction log structures can be created if more detailed, application-specific logging is needed beyond what `GetHistoryForKey` provides.

### 3.3. Chaincode Functions

*   `initLedger()`: Initializes the ledger with some sample land data (optional, for testing).
*   `registerLand(landID, owner, area, location, marketValue, documentHash)`: Creates a new land asset. Only callable by authorized users from Org1 (Government Department).
*   `initiateTransfer(landID, newOwner, initiatedBy)`: Changes the status of a land asset to "TransferPending" and records the proposed new owner. Only callable by authorized users from Org1.
*   `approveTransfer(landID, approvedBy)`: Changes the status to "Transferred" and updates the owner. Only callable by authorized users from Org2 (Land Registry Office).
*   `rejectTransfer(landID, reason, rejectedBy)`: Changes the status back to "Registered" (or a new "TransferRejected" status) and records the reason. Only callable by authorized users from Org2.
*   `queryLand(landID)`: Retrieves the current state of a land asset.
*   `queryLandByOwner(owner)`: Retrieves all land assets owned by a specific owner.
*   `getLandHistory(landID)`: Retrieves the transaction history for a land asset.
*   `verifyDocument(landID, hashToVerify)`: Compares a provided hash with the stored `DocumentHash` for a given `LandID`.

### 3.4. Endorsement Policy

*   **`registerLand`**: Requires endorsement from Org1 (Government Department).
*   **`initiateTransfer`**: Requires endorsement from Org1.
*   **`approveTransfer` / `rejectTransfer`**: Requires endorsement from Org2 (Land Registry Office).
*   **Query functions (`queryLand`, `getLandHistory`, etc.)**: Can typically be satisfied by endorsement from any single organization's peer that the client is connected to, but can be made more stringent if required.
*   The channel-level endorsement policy will be set to `AND('Org1.member', 'Org2.member')` for chaincode instantiation and upgrades, ensuring both organizations agree on the business logic. For transactions, specific endorsement policies will be set at the chaincode or even key level if necessary, though function-level checks combined with role attributes in certificates are more common.

## 4. Web Application Architecture

A web-based interface will be provided for users to interact with the Land Registry Management System.

### 4.1. Components

*   **Frontend (Client-Side):**
    *   **Technology:** A modern JavaScript framework like React, Angular, or Vue.js for a responsive and dynamic user experience.
    *   **Responsibilities:** User interface rendering, user input handling, client-side validation, and communication with the backend API.
*   **Backend (Server-Side):**
    *   **Technology:** Node.js with Express.js is a common choice due to the availability of the Hyperledger Fabric SDK for Node.js. Python (Flask/Django) with a suitable SDK or wrapper can also be used.
    *   **Responsibilities:**
        *   Exposing RESTful APIs for the frontend.
        *   User authentication and session management.
        *   Interacting with the Hyperledger Fabric network (invoking chaincode, querying ledger) using the Fabric SDK.
        *   Handling business logic not suitable for chaincode (e.g., complex data transformations for display).
        *   Interfacing with the off-chain document storage system.
*   **Fabric SDK:**
    *   The backend application will use the Hyperledger Fabric SDK to connect to the network, select endorsing peers, submit transactions to the orderer, and listen for transaction events.
    *   It will manage user identities (certificates) obtained from the Fabric CAs to interact with the chaincode based on the user's role.

### 4.2. Off-Chain Document Storage

*   **Requirement:** Legal documents (deeds, survey plans) are stored off-chain due to their size. Only their cryptographic hashes are stored on-chain.
*   **Solution:** A dedicated document management system (DMS) or a distributed file storage system like IPFS (InterPlanetary File System) is recommended. For a simpler setup, a secure file server with access controls can be used.
*   **Interaction:** The web application backend will handle uploading documents to this off-chain storage, calculating their hash, and then passing the hash to the chaincode during registration or transfer.

## 5. Interaction and Data Flow

1.  **User Authentication:**
    *   Users access the web application via a browser.
    *   They log in using credentials. The backend authenticates the user.
    *   Based on the user's identity (retrieved from Fabric CA or mapped to a Fabric identity), the backend application uses the appropriate certificate to interact with the Fabric network. User roles are embedded in or associated with these certificates.
2.  **Land Registration (Government Department User):**
    *   User fills out the land registration form in the web UI.
    *   Supporting documents are uploaded. The backend stores them off-chain and calculates their hash.
    *   The backend, using the user's identity, invokes the `registerLand` chaincode function with the land details and document hash.
    *   The transaction is endorsed, ordered, and committed to the ledger.
3.  **Ownership Transfer Initiation (Government Department User):**
    *   User selects a land parcel and initiates transfer, providing new owner details.
    *   Backend invokes `initiateTransfer` chaincode function.
4.  **Ownership Transfer Approval/Rejection (Land Registry Office User):**
    *   User reviews pending transfers.
    *   Backend invokes `approveTransfer` or `rejectTransfer` chaincode function.
5.  **Data Query/Verification:**
    *   Users search/query land records via the web UI.
    *   Backend invokes appropriate query functions (`queryLand`, `getLandHistory`) on the chaincode.
    *   Results are displayed to the user.
    *   For document verification, a user can upload a document, the backend calculates its hash and calls `verifyDocument` to compare it with the on-chain hash.

## 6. Security and Access Control

*   **Identity Management:** Fabric CA for each organization manages user identities and issues X.509 certificates.
*   **Role-Based Access Control (RBAC):**
    *   User roles (e.g., `gov_registrar`, `registry_officer`) will be defined as attributes in their certificates issued by the respective CAs.
    *   Chaincode functions will check these attributes to enforce permissions (e.g., only a user with `gov_registrar` role from Org1 can call `registerLand`).
*   **Communication Security:** TLS will be enabled for all communication between Fabric components (peers, orderers, CAs) and between the web application and Fabric nodes.
*   **Private Key Protection:** Secure management of private keys for users and application identities is crucial. Hardware Security Modules (HSMs) can be considered for production environments.
*   **Chaincode Security:** Chaincode will be reviewed for vulnerabilities. Input validation will be strictly enforced within the chaincode.

## 7. Deployment Considerations

*   **Environment:** Development, Staging, Production environments should be planned.
*   **Containerization:** Docker is natively used by Hyperledger Fabric and is recommended for deploying all components (peers, orderers, CAs, web application).
*   **Orchestration:** Kubernetes or Docker Swarm can be used for managing containerized applications in production for scalability and resilience.

## 8. System Architecture Diagram (Conceptual)

```
+----------------------------------------------------------------------------------------------------+
|                                       Web Browser (User Interface)                                 |
+----------------------------------------------------------------------------------------------------+
                                                  ^ (HTTPS)
                                                  |
+----------------------------------------------------------------------------------------------------+
|                                       Web Application Server (Backend)                             |
|                                 (Node.js/Express.js + Fabric SDK)                                  |
|                                 (User Auth, API, Off-chain Doc Hashing)                            |
+----------------------------------------------------------------------------------------------------+
     | ^ (Fabric SDK Interaction - gRPC/TLS)                                      | ^ (HTTP/S)
     |                                                                            |
     |                                                                            v
     |                                                                +-------------------------+
     |                                                                | Off-Chain Document      |
     |                                                                | Storage (e.g., IPFS,    |
     |                                                                | File Server, DMS)       |
     |                                                                +-------------------------+
     |
+----|-----------------------------------------------------------------------------------------------+
|    v                                   Hyperledger Fabric Network                                  |
|                                                                                                    |
|  +---------------------+ Org1 CA +---------------------+      +---------------------+ Org2 CA +---------------------+ |
|  | Fabric CA (Org1)    |---------| Peer 0 (Org1)       |<------>| Peer 0 (Org2)       |---------| Fabric CA (Org2)    | |
|  | gov.department.com  |         | (Anchor Peer)       |      | (Anchor Peer)       |         | landregistry.com  | |
|  +---------------------+         | Ledger + Chaincode  |      | Ledger + Chaincode  |         +---------------------+ |
|                                  | Peer 1 (Org1)       |      | Peer 1 (Org2)       |                               |
|                                  +---------------------+      +---------------------+                               |
|                                        ^       ^                      ^       ^                                   |
|                                        |       | (Endorsement, Queries) |       |                                   |
|                                        |       +----------------------+       |                                   |
|                                        |                                      |                                   |
|                                        +--------------->Orderer Service<------+                                   |
|                                                        (Raft Consensus)                                          |
|                                                        (e.g., orderer.example.com)                             |
|                                                                                                    |
|                                            Channel: landchannel                                    |
+----------------------------------------------------------------------------------------------------+

Key:
<--> : Bi-directional communication (Peer-to-Peer Gossip, Application-Orderer)
----> : Uni-directional communication
```

This diagram illustrates the main components and their interactions. The Web Application Server acts as the bridge between the users and the Hyperledger Fabric network, handling API requests and using the Fabric SDK. Each organization has its own CA and peer nodes. The Orderer Service ensures transaction consensus. Off-chain storage is used for large documents.

## 9. Scalability and Maintainability

*   **Scalability:** Peers can be added to organizations as needed. The Raft ordering service can also be scaled. The web application can be scaled horizontally by running multiple instances behind a load balancer.
*   **Maintainability:** Chaincode can be upgraded. The modular design (frontend, backend, chaincode) allows for independent updates and maintenance.

This architecture provides a robust foundation for the Land Registry Management System. Further detailed design will occur for each component during the implementation phase.
