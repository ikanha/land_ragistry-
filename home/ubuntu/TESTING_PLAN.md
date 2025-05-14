# Land Registry Management System - Testing Plan

## 1. Introduction

This document outlines the testing plan for the Land Registry Management System. The goal is to ensure all functionalities work as expected, security measures are effective, and the system is robust.

**Testing Environment Setup:**

1.  Ensure Hyperledger Fabric network is running (using `./network.sh up` from the `land-registry-fabric/scripts` directory).
2.  Ensure the chaincode `landregistrycc` is installed on peers and instantiated on the `landchannel`.
3.  Ensure the web application server (`server.js`) is running (`node server.js` from the `land-registry-app` directory).
4.  Access the web interface via a browser (typically `http://localhost:3000`).

## 2. Test Cases

For each test case, the tester will use the web interface, select the appropriate simulated role, and perform the actions. The "Response Area" on the web page and the server console logs will be monitored for results and errors.

### 2.1. Role: Government Department (Org1MSP - `gov_registrar`)

**Selected Role in UI:** "Government Department (Org1)"

| Test Case ID | Feature             | Action                                                                 | Expected Result (UI/Chaincode)                                                                                                | Actual Result | Status (Pass/Fail) |
|--------------|---------------------|------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|---------------|--------------------|
| TC-ORG1-001  | Land Registration   | Register a new land parcel (e.g., LandID: L101) with valid details.    | Success message. Land L101 created on the ledger. Querying L101 should return its details.                                    |               |                    |
| TC-ORG1-002  | Land Registration   | Attempt to register a land parcel with an existing LandID (e.g., L101). | Error message: "Land with ID L101 already exists."                                                                            |               |                    |
| TC-ORG1-003  | Initiate Transfer   | Initiate transfer for L101 to a new owner (e.g., "NewOwnerCharlie").   | Success message. Land L101 status changes to "TransferPending". Querying L101 shows pendingNewOwner.                         |               |                    |
| TC-ORG1-004  | Initiate Transfer   | Attempt to initiate transfer for a non-existent LandID (e.g., L999).   | Error message: "Land with ID L999 does not exist."                                                                            |               |                    |
| TC-ORG1-005  | Initiate Transfer   | Attempt to initiate transfer for a land already "TransferPending" (e.g. L101 after TC-ORG1-003). | Error message: "Land L101 is not in a state where transfer can be initiated."                                               |               |                    |
| TC-ORG1-006  | RBAC - Negative     | Attempt to Approve Transfer (Org2 function) for L101.                  | Error message from chaincode indicating lack of authorization (wrong role/MSP). UI might block or server returns error.         |               |                    |
| TC-ORG1-007  | RBAC - Negative     | Attempt to Reject Transfer (Org2 function) for L101.                   | Error message from chaincode indicating lack of authorization.                                                                |               |                    |

### 2.2. Role: Land Registry Office (Org2MSP - `registry_officer`)

**Selected Role in UI:** "Land Registry Office (Org2)"

| Test Case ID | Feature             | Action                                                                     | Expected Result (UI/Chaincode)                                                                                                  | Actual Result | Status (Pass/Fail) |
|--------------|---------------------|----------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|---------------|--------------------|
| TC-ORG2-001  | Approve Transfer    | Approve transfer for Land L101 (initiated in TC-ORG1-003).                 | Success message. Land L101 owner updated to "NewOwnerCharlie", status changes to "Transferred".                               |               |                    |
| TC-ORG2-002  | Approve Transfer    | Attempt to approve transfer for a land not in "TransferPending" state.     | Error message: "Land ... is not pending transfer."                                                                              |               |                    |
| TC-ORG2-003  | Approve Transfer    | Attempt to approve transfer for a non-existent LandID.                     | Error message: "Land ... does not exist."                                                                                       |               |                    |
| TC-ORG2-004  | Reject Transfer     | (Assuming another land L102 is initiated for transfer by Org1) Reject transfer for L102 with a reason. | Success message. Land L102 status changes to "TransferRejected", reason recorded.                                             |               |                    |
| TC-ORG2-005  | Reject Transfer     | Attempt to reject transfer for a land not in "TransferPending" state.      | Error message: "Land ... is not pending transfer."                                                                              |               |                    |
| TC-ORG2-006  | RBAC - Negative     | Attempt to Register Land (Org1 function).                                  | Error message from chaincode indicating lack of authorization (wrong role/MSP). UI might block or server returns error.           |               |                    |
| TC-ORG2-007  | RBAC - Negative     | Attempt to Initiate Transfer (Org1 function).                              | Error message from chaincode indicating lack of authorization.                                                                  |               |                    |

### 2.3. Common Functions (Accessible by both Org1 & Org2, with appropriate identities)

| Test Case ID | Feature             | Role (UI)      | Action                                                                 | Expected Result (UI/Chaincode)                                                                  | Actual Result | Status (Pass/Fail) |
|--------------|---------------------|----------------|------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|---------------|--------------------|
| TC-COM-001   | Query Land          | Org1 or Org2   | Query an existing land parcel (e.g., L101).                            | Land details for L101 are displayed.                                                            |               |                    |
| TC-COM-002   | Query Land          | Org1 or Org2   | Query a non-existent land parcel (e.g., L999).                         | Error message: "Land with ID L999 does not exist."                                              |               |                    |
| TC-COM-003   | Get Land History    | Org1 or Org2   | Get history for an existing land parcel (e.g., L101).                  | Transaction history for L101 is displayed.                                                      |               |                    |
| TC-COM-004   | Get Land History    | Org1 or Org2   | Get history for a non-existent land parcel.                            | Empty history or error indicating key does not exist (depending on chaincode GetHistoryForKey behavior for non-existent keys). |               |                    |
| TC-COM-005   | Verify Document     | Org1 or Org2   | Verify document for L101 with its correct hash.                        | Success message: "Document hash matches...", verified: true.                                    |               |                    |
| TC-COM-006   | Verify Document     | Org1 or Org2   | Verify document for L101 with an incorrect hash.                       | Message: "Document hash does not match...", verified: false.                                    |               |                    |
| TC-COM-007   | Verify Document     | Org1 or Org2   | Verify document for a non-existent land parcel.                        | Error message: "Land ... does not exist."                                                       |               |                    |

### 2.4. Security & RBAC (Direct API tests can supplement UI tests)

These tests might involve using tools like `curl` or Postman to directly hit backend API endpoints with different simulated user identities/tokens if a more advanced auth system were in place. For the current simulation, UI tests cover much of this by selecting roles.

| Test Case ID | Feature         | Action                                                                                                | Expected Result                                                                                                | Actual Result | Status (Pass/Fail) |
|--------------|-----------------|-------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|---------------|--------------------|
| TC-SEC-001   | RBAC - Org1     | As Org1 user (via UI), attempt to call `approveTransfer` chaincode function.                          | Chaincode rejects the transaction due to incorrect MSP ID/role. Server returns an error.                       |               |                    |
| TC-SEC-002   | RBAC - Org2     | As Org2 user (via UI), attempt to call `registerLand` chaincode function.                             | Chaincode rejects the transaction due to incorrect MSP ID/role. Server returns an error.                       |               |                    |
| TC-SEC-003   | Data Immutability | (Conceptual) Attempt to modify a committed block on the ledger directly (not possible via chaincode). | Hyperledger Fabric prevents this. This is a core feature, not testable via the application itself.             | N/A           | Pass (by design)   |
| TC-SEC-004   | User Enrollment | Verify `Org1MSPUser` has `gov_registrar` role attribute in wallet.                                    | (Manual Check of wallet or CA logs if accessible) Attribute should be present.                                 |               |                    |
| TC-SEC-005   | User Enrollment | Verify `Org2MSPUser` has `registry_officer` role attribute in wallet.                                   | (Manual Check) Attribute should be present.                                                                    |               |                    |

## 3. Test Execution and Reporting

*   Each test case will be executed manually following the steps.
*   The "Actual Result" column will be filled based on observations from the UI and server logs.
*   The "Status" column will be marked as "Pass" or "Fail".
*   Any failed tests will be documented with details of the failure, steps to reproduce, and assigned for debugging.

## 4. Post-Testing

*   Once all critical and high-priority test cases pass, the system can be considered ready for the next phase (e.g., user acceptance testing or deployment preparation).
*   A summary test report will be generated.

This testing plan provides a baseline. Additional exploratory testing and edge case testing should also be performed.
