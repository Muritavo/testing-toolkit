require("@nomiclabs/hardhat-ethers");

const config = {
  networks: {
    hardhat: {
      chainId: 80001,
      forking: {
        url: "<your-sepolia-key-here>",
        blockNumber: 5684896,
      },
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
