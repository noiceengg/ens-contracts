import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { getAddress } from 'viem'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { viem } = hre

  // 1. GET DEPLOY ARGS
  // The gateway URL, which the client will call
  const gatewayUrls = (
    process.env.GATEWAY_URLS ||
    'https://dc17-2401-4900-1f27-8df6-d73-3b7-2ca7-917a.ngrok-free.app/{sender}/{data}'
  ).split(',')

  // The address of the signer key used by the gateway
  const trustedSignerEnv = process.env.TRUSTED_SIGNER
  if (!trustedSignerEnv) {
    throw new Error(
      'TRUSTED_SIGNER environment variable not set. Please export the gateway signer address.',
    )
  }
  const trustedSigner = getAddress(trustedSignerEnv)

  console.log(`Deploying L2CCIPResolver on ${hre.network.name} with:`)
  console.log(`  - gatewayUrls: ${gatewayUrls.join(', ')}`)
  console.log(`  - trustedSigner: ${trustedSigner}`)
  console.log('')

  // 2. DEPLOY CONTRACT
  const deployment = await viem.deploy('L2CCIPResolver', [
    gatewayUrls,
    trustedSigner,
  ])

  console.log(
    `🚀 L2CCIPResolver deployed to ${deployment.address} on ${hre.network.name}`,
  )
  console.log(`   (Use this as the resolver for your parent domain on L1)`)

  return true
}

func.id = 'L2CCIPResolver'
func.tags = ['L2CCIPResolver']
func.dependencies = []
func.skip = async function (hre: HardhatRuntimeEnvironment) {
  // This is an L1 resolver, so it should NOT be deployed on an L2.
  if (hre.network.tags.l2) {
    return true
  }
  return false
}

export default func
