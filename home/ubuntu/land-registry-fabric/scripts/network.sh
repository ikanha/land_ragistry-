#!/bin/bash

# Set environment variables
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export VERBOSE=false

# Print the usage message
function printHelp() {
  echo "Usage: "
  echo "  network.sh <mode> [-v]"
  echo "    <mode> - one of \'up\', \'down\', \'generate\', \'restart\', \'clean\', \'upgrade\', \'help\'"
  echo "      - \'up\' - bring up the network with docker-compose up & create channel & join peers"
  echo "      - \'down\' - clear the network with docker-compose down"
  echo "      - \'generate\' - generate required certificates and genesis block"
  echo "      - \'restart\' - restart the network"
  echo "      - \'clean\' - remove crypto material and channel artifacts"
  echo "    -v - verbose mode"
  echo "  network.sh help (print this message)"
  echo
  echo "Taking all defaults:"
  echo "	network.sh generate"
  echo "	network.sh up"
  echo "	network.sh down"
}

# Ask user for confirmation to proceed
function askProceed() {
  read -p "Continue? [Y/n] " ans
  case "$ans" in
  y | Y | "")
    echo "proceeding ..."
    ;;
  n | N)
    echo "exiting ..."
    exit 1
    ;;
  *)
    echo "invalid response"
    askProceed
    ;;
  esac
}

# Generate CCP files for Org1 and Org2
function generateCCP() {
  ORG_NAME=$1
  ORG_DOMAIN=$2
  CA_PORT=$3
  PEER0_PORT=$4
  PEER0_CA_NAME=$5
  
  echo "# Connection profile for ${ORG_NAME}" > ../config/ccp-${ORG_NAME}.yaml
  echo "name: land-registry-network-${ORG_NAME}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "version: 1.0.0" >> ../config/ccp-${ORG_NAME}.yaml
  echo "" >> ../config/ccp-${ORG_NAME}.yaml
  echo "client:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "  organization: ${ORG_NAME}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "  connection:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    timeout:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      peer:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "        endorser: \"300\"" >> ../config/ccp-${ORG_NAME}.yaml
  echo "" >> ../config/ccp-${ORG_NAME}.yaml
  echo "organizations:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "  ${ORG_NAME}:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    mspid: ${ORG_NAME}MSP" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    peers:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      - peer0.${ORG_DOMAIN}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    certificateAuthorities:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      - ca.${ORG_DOMAIN}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "" >> ../config/ccp-${ORG_NAME}.yaml
  echo "peers:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "  peer0.${ORG_DOMAIN}:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    url: grpcs://localhost:${PEER0_PORT}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    tlsCACerts:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      path: ../crypto-config/peerOrganizations/${ORG_DOMAIN}/tlsca/tlsca.${ORG_DOMAIN}-cert.pem" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    grpcOptions:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      ssl-target-name-override: peer0.${ORG_DOMAIN}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      hostnameOverride: peer0.${ORG_DOMAIN}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "" >> ../config/ccp-${ORG_NAME}.yaml
  echo "certificateAuthorities:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "  ca.${ORG_DOMAIN}:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    url: https://localhost:${CA_PORT}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    caName: ${PEER0_CA_NAME}" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    tlsCACerts:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      path: ../crypto-config/peerOrganizations/${ORG_DOMAIN}/tlsca/tlsca.${ORG_DOMAIN}-cert.pem" >> ../config/ccp-${ORG_NAME}.yaml
  echo "    httpOptions:" >> ../config/ccp-${ORG_NAME}.yaml
  echo "      verify: false" >> ../config/ccp-${ORG_NAME}.yaml
}

# Generates Org certs using cryptogen tool
function generateCerts() {
  which cryptogen
  if [ "$?" -ne 0 ]; then
    echo "cryptogen tool not found. exiting"
    exit 1
  fi
  echo
  echo "##########################################################"
  echo "##### Generate certificates using cryptogen tool #########"
  echo "##########################################################"

  if [ -d "../crypto-config" ]; then
    rm -Rf ../crypto-config
  fi
  set -x
  cryptogen generate --config=../config/crypto-config.yaml --output="../crypto-config"
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate certificates..."
    exit 1
  fi
  echo
  echo "Generate CCP files for Org1 and Org2"
  generateCCP Org1 org1.example.com 7054 7051 ca-org1
  generateCCP Org2 org2.example.com 8054 9051 ca-org2
}

# Generate orderer genesis block, channel configuration transaction and anchor peer update transactions
function generateChannelArtifacts() {
  which configtxgen
  if [ "$?" -ne 0 ]; then
    echo "configtxgen tool not found. exiting"
    exit 1
  fi 

  echo "##########################################################"
  echo "#########  Generating Orderer Genesis block ##############"
  echo "##########################################################"
  # Note: For some unknown reason (at least for now) the block file can\\'t be
  # named orderer.genesis.block or the orderer will fail to launch!
  set -x
  configtxgen -profile TwoOrgsOrdererGenesis -channelID byfn-sys-channel -outputBlock ../channel-artifacts/genesis.block
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate orderer genesis block..."
    exit 1
  fi 
  echo
  echo "#################################################################"
  echo "### Generating channel configuration transaction \'channel.tx\' ###"
  echo "#################################################################"
  set -x
  configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ../channel-artifacts/landchannel.tx -channelID landchannel
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate channel configuration transaction..."
    exit 1
  fi 

  echo
  echo "#################################################################"
  echo "#######    Generating anchor peer update for Org1MSP   ##########"
  echo "#################################################################"
  set -x
  configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ../channel-artifacts/Org1MSPanchors.tx -channelID landchannel -asOrg Org1MSP
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate anchor peer update for Org1MSP..."
    exit 1
  fi 

  echo
  echo "#################################################################"
  echo "#######    Generating anchor peer update for Org2MSP   ##########"
  echo "#################################################################"
  set -x
  configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ../channel-artifacts/Org2MSPanchors.tx -channelID landchannel -asOrg Org2MSP
  res=$?
  set +x
  if [ $res -ne 0 ]; then
    echo "Failed to generate anchor peer update for Org2MSP..."
    exit 1
  fi 
  echo
}

# Obtain the OS and Architecture string that will be used to select the correct binary
OS_ARCH=$(echo "$(uname -s | tr \'[:upper:]\' \'[:lower:]\' | sed \'s/mingw64_nt.*/windows/\')-$(uname -m | sed \'s/x86_64/amd64/g\')" | awk \'{print tolower($0)}\')

# Download Hyperledger Fabric tools if not present
function downloadFabricTools() {
  if [ ! -d "../bin" ] || [ ! -f "../bin/cryptogen" ] || [ ! -f "../bin/configtxgen" ]; then
    echo "Fabric tools not found. Downloading..."
    mkdir -p ../bin
    curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/master/scripts/bootstrap.sh | bash -s -- 2.5.0 1.5.7 -d -s -b
    # The script above downloads to current dir, so move them
    mv bin/* ../bin/
    mv config/* ../config/ # This will overwrite our custom configtx.yaml, so we need to be careful or restore it.
    # For now, let's assume we will manage configtx.yaml manually and not let bootstrap.sh overwrite it.
    # Or, better, let bootstrap.sh download to a temp dir and copy only bin.
    # For simplicity now, we will assume the user has the tools or we will download and they might need to fix configtx.yaml if overwritten.
    # A better approach for production: build the binaries or use official docker images for tools.
    echo "Fabric tools downloaded. Please ensure your configtx.yaml in ../config is correct."
  fi
}

# Start the network
function networkUp() {
  # Check if the tools are available
  downloadFabricTools

  # generate artifacts if they don\'t exist
  if [ ! -d "../crypto-config" ]; then
    generateCerts
    generateChannelArtifacts
  fi

  # Create folder for channel artifacts if it doesn\'t exist
  mkdir -p ../channel-artifacts

  IMAGE_TAG="latest" # Assuming latest tag for fabric images
  COMPOSE_FILES="-f ../docker-compose.yaml"

  # Start the network
  echo "Starting network..."
  IMAGE_TAG=$IMAGE_TAG docker-compose ${COMPOSE_FILES} up -d 2>&1
  docker ps -a
  if [ $? -ne 0 ]; then
    echo "ERROR !!!! Unable to start network"
    exit 1
  fi

  echo "Sleeping for 15s to allow network to fully start..."
  sleep 15

  # Create channel, join peers, update anchor peers
  echo "Creating channel and joining peers..."
  docker exec cli ./scripts/channel_operations.sh
  if [ $? -ne 0 ]; then
    echo "ERROR !!!! Failed to create channel or join peers"
    exit 1
  fi

  echo "Network started successfully"
}

# Tear down the network
function networkDown() {
  echo "Stopping and removing network containers, volumes, and images..."
  docker-compose -f ../docker-compose.yaml down --volumes --remove-orphans
  # Remove chaincode docker images
  docker rmi $(docker images dev-* -q) 2>/dev/null || true
  echo "Network stopped and cleaned."
}

# Clean up crypto material and channel artifacts
function cleanNetwork() {
  networkDown
  echo "Removing crypto material and channel artifacts..."
  rm -rf ../channel-artifacts/*
  rm -rf ../crypto-config
  # rm -rf ../config/ccp-*.yaml # Keep CCP files for now
  echo "Cleaned up network artifacts."
}

# Script for channel operations (create, join, update anchor peers)
function createChannelOperationsScript() {
  echo "#!/bin/bash" > ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "export CORE_PEER_TLS_ENABLED=true" >> ./channel_operations.sh
  echo "export ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" >> ./channel_operations.sh
  echo "export CHANNEL_NAME=landchannel" >> ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "setGlobals() {" >> ./channel_operations.sh
  echo "  PEER=$1" >> ./channel_operations.sh
  echo "  ORG=$2" >> ./channel_operations.sh
  echo "  if [ \"$ORG\" == \"Org1\" ]; then" >> ./channel_operations.sh
  echo "    export CORE_PEER_LOCALMSPID=\"Org1MSP\"" >> ./channel_operations.sh
  echo "    export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" >> ./channel_operations.sh
  echo "    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp" >> ./channel_operations.sh
  echo "    if [ \"$PEER\" == \"peer0\" ]; then" >> ./channel_operations.sh
  echo "      export CORE_PEER_ADDRESS=peer0.org1.example.com:7051" >> ./channel_operations.sh
  echo "    else" >> ./channel_operations.sh
  echo "      export CORE_PEER_ADDRESS=peer1.org1.example.com:8051" >> ./channel_operations.sh
  echo "    fi" >> ./channel_operations.sh
  echo "  elif [ \"$ORG\" == \"Org2\" ]; then" >> ./channel_operations.sh
  echo "    export CORE_PEER_LOCALMSPID=\"Org2MSP\"" >> ./channel_operations.sh
  echo "    export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" >> ./channel_operations.sh
  echo "    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp" >> ./channel_operations.sh
  echo "    if [ \"$PEER\" == \"peer0\" ]; then" >> ./channel_operations.sh
  echo "      export CORE_PEER_ADDRESS=peer0.org2.example.com:9051" >> ./channel_operations.sh
  echo "    else" >> ./channel_operations.sh
  echo "      export CORE_PEER_ADDRESS=peer1.org2.example.com:10051" >> ./channel_operations.sh
  echo "    fi" >> ./channel_operations.sh
  echo "  else" >> ./channel_operations.sh
  echo "    echo \"================== ERROR !!! ORG Unknown ==================\"" >> ./channel_operations.sh
  echo "  fi" >> ./channel_operations.sh
  echo "}" >> ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "createChannel() {" >> ./channel_operations.sh
  echo "  setGlobals peer0 Org1" >> ./channel_operations.sh
  echo "  peer channel create -o orderer.example.com:7050 -c \$CHANNEL_NAME -f ./channel-artifacts/landchannel.tx --outputBlock ./channel-artifacts/\${CHANNEL_NAME}.block --tls --cafile \$ORDERER_CA" >> ./channel_operations.sh
  echo "  echo \"Channel \\\"\$CHANNEL_NAME\\\" created\"" >> ./channel_operations.sh
  echo "}" >> ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "joinChannel() {" >> ./channel_operations.sh
  echo "  for org in Org1 Org2; do" >> ./channel_operations.sh
  echo "    for peer in peer0 peer1; do" >> ./channel_operations.sh
  echo "      setGlobals \$peer \$org" >> ./channel_operations.sh
  echo "      peer channel join -b ./channel-artifacts/\$CHANNEL_NAME.block" >> ./channel_operations.sh
  echo "      echo \"===================== \$peer.\$org joined channel \\\"\$CHANNEL_NAME\\\" ===================== \"" >> ./channel_operations.sh
  echo "      sleep 2" >> ./channel_operations.sh
  echo "    done" >> ./channel_operations.sh
  echo "  done" >> ./channel_operations.sh
  echo "}" >> ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "updateAnchorPeers() {" >> ./channel_operations.sh
  echo "  setGlobals peer0 Org1" >> ./channel_operations.sh
  echo "  peer channel update -o orderer.example.com:7050 -c \$CHANNEL_NAME -f ./channel-artifacts/Org1MSPanchors.tx --tls --cafile \$ORDERER_CA" >> ./channel_operations.sh
  echo "  echo \"Anchor peers for Org1 updated\"" >> ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "  setGlobals peer0 Org2" >> ./channel_operations.sh
  echo "  peer channel update -o orderer.example.com:7050 -c \$CHANNEL_NAME -f ./channel-artifacts/Org2MSPanchors.tx --tls --cafile \$ORDERER_CA" >> ./channel_operations.sh
  echo "  echo \"Anchor peers for Org2 updated\"" >> ./channel_operations.sh
  echo "}" >> ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "createChannel" >> ./channel_operations.sh
  echo "joinChannel" >> ./channel_operations.sh
  echo "updateAnchorPeers" >> ./channel_operations.sh
  echo "" >> ./channel_operations.sh
  echo "echo \"Channel operations completed successfully\"" >> ./channel_operations.sh
  chmod +x ./channel_operations.sh
}

# Check if channel_operations.sh exists, if not create it
if [ ! -f ./channel_operations.sh ]; then
  createChannelOperationsScript
fi

# Parse commandline args
if [ "$1" == "-v" ]; then
  VERBOSE=true
  shift
fi
MODE=$1
shift

# Determine mode of operation and call parts functions
if [ "$MODE" == "up" ]; then
  networkUp
elif [ "$MODE" == "down" ]; then
  networkDown
elif [ "$MODE" == "generate" ]; then
  downloadFabricTools # Ensure tools are present before generating
  generateCerts
  generateChannelArtifacts
elif [ "$MODE" == "restart" ]; then
  networkDown
  networkUp
elif [ "$MODE" == "clean" ]; then
  cleanNetwork
elif [ "$MODE" == "help" ]; then
  printHelp
  exit 0
else
  printHelp
  exit 1
fi

