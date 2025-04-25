import { DeployFunction } from "hardhat-deploy/types";

const f: DeployFunction = async ({ getNamedAccounts, deployments }: any) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("UndefinedContract", {
    from: deployer,
    args: [],
    log: true,
  });
};
export default f;
f.tags = ["ignore-tag"];
