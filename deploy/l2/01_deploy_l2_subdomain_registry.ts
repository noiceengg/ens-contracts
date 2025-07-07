import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { parseEther } from 'viem'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { viem } = hre

  // 1. GET DEPLOY ARGS
  const parentDomain = process.env.PARENT_DOMAIN || 'amanraj.eth'
  const registrationFee = process.env.REGISTRATION_FEE || parseEther('0.001')

  console.log(`Deploying L2SubdomainRegistry on ${hre.network.name} with:`)
  console.log(`  - parentDomain: ${parentDomain}`)
  console.log(`  - registrationFee: ${registrationFee.toString()} wei`)
  console.log('')

  // 2. DEPLOY CONTRACT
  const deployment = await viem.deploy('L2SubdomainRegistry', [
    parentDomain,
    registrationFee,
  ])

  console.log(
    `🚀 L2SubdomainRegistry deployed to ${deployment.address} on ${hre.network.name}`,
  )
  console.log(
    `   (Set L2_REGISTRY_ADDRESS=${deployment.address} in your .env file)`,
  )

  return true
}

func.id = 'L2SubdomainRegistry'
func.tags = ['L2SubdomainRegistry']
func.dependencies = []
func.skip = async function (hre: HardhatRuntimeEnvironment) {
  // Skip on non-L2 or non-local networks
  if (hre.network.tags.l2 || hre.network.tags.local) {
    return false
  }
  return true
}

export default func 