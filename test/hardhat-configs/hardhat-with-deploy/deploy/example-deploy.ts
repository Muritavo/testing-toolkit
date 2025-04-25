import { DeployFunction } from "hardhat-deploy/types";

const f: DeployFunction = async (ctx: any) => {
  const { getNamedAccounts, deployments } = ctx;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("AnotherContract", {
    from: deployer,
    args: [],
    log: true,
  });
};
export default f;
f.tags = ["example-tag"];
