# System Requirements for Land Registry Management System

## 1. Introduction

The Land Registry Management System is a permissioned blockchain application designed to provide a secure, transparent, and immutable record of land ownership and transactions. It leverages Hyperledger Fabric to ensure data integrity and traceability.

## 2. User Roles and Permissions

The system will have the following user roles with specific permissions:

*   **Government Department User:**
    *   Can register new land parcels.
    *   Can initiate land ownership transfers (subject to approval).
    *   Can view all land records and transaction histories.
    *   Cannot directly modify existing land records after registration, except through defined transaction processes.
*   **Land Registry Office User:**
    *   Can approve or reject land ownership transfer requests initiated by the Government Department.
    *   Can verify land data and supporting documents.
    *   Can view all land records and transaction histories.
    *   Cannot register new land parcels.
*   **System Administrator (Implicit):**
    *   Manages user accounts and roles (via Fabric CA).
    *   Monitors system health and performance.
    *   Manages chaincode deployment and upgrades.

## 3. Functional Requirements

### 3.1. Land Registration

*   Authorized users (Government Department) must be able to register new land parcels.
*   The following information must be captured for each land parcel:
    *   Unique Land ID (system-generated or manually input, ensuring uniqueness)
    *   Owner Details (e.g., name, national ID, contact information)
    *   Area (e.g., in square meters or acres)
    *   Location (e.g., address, GPS coordinates)
    *   Market Value (estimated current market value)
    *   Cryptographic hash of supporting legal documents (e.g., deeds, survey plans). The actual documents will be stored off-chain, and their hash will be stored on-chain for integrity verification.
*   Upon successful registration, a new land record is created on the blockchain.

### 3.2. Transfer of Ownership

*   Authorized users (Government Department) must be able to initiate a transfer of ownership for a registered land parcel.
*   The initiation process requires specifying the Land ID, current owner, and new owner details.
*   The transfer request is submitted to the Land Registry Office for approval.
*   Land Registry Office users can review the transfer request, verify details, and supporting documents (hashes).
*   Land Registry Office users can approve or reject the transfer request.
*   If approved, the ownership details in the land record are updated on the blockchain, and a transaction record is created.
*   If rejected, the reason for rejection is recorded, and the ownership remains unchanged.

### 3.3. Land Data Verification

*   Authorized users (both Government Department and Land Registry Office) must be able to query and verify land data.
*   Users should be able to search for land records using various criteria (e.g., Land ID, owner name, location).
*   The system must display the complete history of ownership and transactions for a selected land parcel.
*   Users should be able to verify the integrity of supporting legal documents by comparing their hash with the hash stored on the blockchain.

### 3.4. Web Interface

*   A user-friendly web interface must be provided for all user interactions.
*   The interface should be role-based, displaying only relevant functionalities and data to the logged-in user.
*   The interface should allow for:
    *   User login and authentication.
    *   Land registration (for Government Department users).
    *   Initiation of ownership transfer (for Government Department users).
    *   Approval/rejection of ownership transfer (for Land Registry Office users).
    *   Viewing and searching land records.
    *   Viewing ownership history.
    *   Uploading (or linking to) supporting documents and generating their hashes for on-chain storage.

## 4. Non-Functional Requirements

### 4.1. Security

*   **Permissioned Access:** The system must be a permissioned blockchain, accessible only to authorized organizations and users.
*   **Role-Based Access Control (RBAC):** Access to system functionalities and data must be strictly controlled based on user roles, implemented using Hyperledger Fabric's Certificate Authority (CA).
*   **Data Immutability:** All land records and transaction histories stored on the blockchain must be immutable and tamper-proof.
*   **Data Integrity:** Cryptographic hashes of supporting documents must ensure their integrity.
*   **Auditability/Traceability:** All transactions must be traceable, providing a clear audit trail of changes.
*   **Authentication:** Secure user authentication mechanisms must be in place.

### 4.2. Performance

*   The system should handle a reasonable number of concurrent users and transactions without significant degradation in performance.
*   Query response times for land records should be acceptable (e.g., within a few seconds).

### 4.3. Scalability

*   The system should be designed to accommodate future growth in the number of land records, users, and organizations.

### 4.4. Usability

*   The web interface should be intuitive and easy to use for non-technical users.

### 4.5. Reliability and Availability

*   The system should be reliable and highly available, minimizing downtime.

## 5. System Architecture Overview (High-Level)

*   **Blockchain Platform:** Hyperledger Fabric
*   **Organizations:** 
    *   Org1: Government Department
    *   Org2: Land Registry Office
*   **Smart Contracts (Chaincode):** To manage land registration, ownership transfer, and data verification logic.
*   **Certificate Authority (CA):** Fabric CA for managing identities and issuing certificates for RBAC.
*   **Off-Chain Storage:** For storing large legal documents. Only their hashes are stored on-chain.
*   **Web Application:** Frontend interface for user interaction, backend to interact with the Fabric network.

## 6. Data Model (On-Chain)

*   **LandAsset:**
    *   `LandID`: string (unique identifier)
    *   `Owner`: string (current owner's identifier/details)
    *   `Area`: string (e.g., "1000 sqm")
    *   `Location`: string (address or coordinates)
    *   `MarketValue`: float
    *   `DocumentHash`: string (hash of legal documents)
    *   `Status`: string (e.g., "Registered", "TransferPending", "Transferred")
    *   `History`: array of TransactionLog (or reference to transaction IDs)

*   **TransactionLog (or equivalent structure for history):**
    *   `TransactionID`: string (unique identifier)
    *   `Timestamp`: datetime
    *   `PreviousOwner`: string
    *   `NewOwner`: string
    *   `Action`: string (e.g., "Register", "TransferInitiated", "TransferApproved", "TransferRejected")
    *   `PerformedBy`: string (user ID or role)
    *   `Comments`: string (optional, e.g., reason for rejection)

## 7. Assumptions

*   The two organizations (Government Department and Land Registry Office) are willing to collaborate and participate in the blockchain network.
*   A secure off-chain storage solution for legal documents will be available.
*   Users will have the necessary digital literacy to use the web interface.

This document outlines the initial requirements. Further details may be refined during the design and development phases.
