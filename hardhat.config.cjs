require("@nomiclabs/hardhat-ethers");

/** @type {import("hardhat")['config']} */
const config = {
  networks: {
    hardhat: {
      chainId: 80001,
      forking: {
        url: "https://eth-sepolia.g.alchemy.com/v2/shYCE2ZKGb0z2fexVvYDBWGezLmGKOB6",
        blockNumber: 5684896,
      },
      blockGasLimit: 90000000,
      loggingEnabled: false
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
    ],
  },
  gasReporter: {
    enabled: false,
    currency: "USD",
  },
  watcher: {
    compile: {
      tasks: ["compile"],
      files: ["./contracts"],
      verbose: true,
      runOnLaunch: true,
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  contractSizer: {
    runOnCompile: false,
    strict: true,
  },
};

module.exports = config;
