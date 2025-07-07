import { parseEther } from 'viem'
import hre from 'hardhat'

async function registerNewSubdomain() {
  console.log('🚀 Registering New L2 Subdomain')
  console.log('================================')

  const L2_REGISTRY_ADDRESS =
    process.env.L2_REGISTRY_ADDRESS ||
    '0xbaFf9FbcaE4197E6A1a44df4a2139212E781c5CB'

  // Customize these values:
  const PARENT_DOMAIN = 'amanraj.eth' // Change this to your parent domain
  const SUBDOMAIN_NAME = 'alice' // Change this to your desired subdomain
  const TARGET_ADDRESS = '0x42138576848E839827585A3539305774D36B9602' // Address it should resolve to

  console.log(`📍 L2 Registry: ${L2_REGISTRY_ADDRESS}`)
  console.log(`🏷️  Subdomain: ${SUBDOMAIN_NAME}.${PARENT_DOMAIN}`)
  console.log(`🎯 Target Address: ${TARGET_ADDRESS}`)
  console.log('')

  // Get signer
  const [signer] = await hre.viem.getWalletClients()
  const publicClient = await hre.viem.getPublicClient()

  console.log(`👤 Registering as: ${signer.account.address}`)

  // Get contract instance
  const registry = await hre.viem.getContractAt(
    'L2SubdomainRegistry',
    L2_REGISTRY_ADDRESS,
    { client: { public: publicClient, wallet: signer } },
  )

  try {
    console.log('📋 Step 1: Check registration fee')
    const fee = await registry.read.registrationFee()
    console.log(`💰 Registration fee: ${fee} wei (${Number(fee) / 1e18} ETH)`)
    console.log('')

    console.log('📋 Step 2: Check if subdomain already exists')
    const existing = await registry.read.resolve([SUBDOMAIN_NAME])
    const [exists, owner, resolvedAddr] = existing

    if (exists) {
      console.log(`⚠️  Subdomain "${SUBDOMAIN_NAME}" already exists:`)
      console.log(`   Owner: ${owner}`)
      console.log(`   Resolves to: ${resolvedAddr}`)
      console.log('')
      console.log(
        'Choose a different subdomain name or update the existing one.',
      )
      return
    }

    console.log(`✅ Subdomain "${SUBDOMAIN_NAME}" is available`)
    console.log('')

    console.log('📋 Step 3: Register subdomain')
    console.log(`Registering: ${SUBDOMAIN_NAME}.${PARENT_DOMAIN}`)
    console.log(`Points to: ${TARGET_ADDRESS}`)
    console.log(`Fee: ${fee} wei`)

    const tx = await registry.write.registerSubdomain(
      [SUBDOMAIN_NAME, TARGET_ADDRESS],
      {
        value: fee,
      },
    )

    console.log(`📝 Transaction sent: ${tx}`)
    console.log('⏳ Waiting for confirmation...')

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`)
    console.log('')

    console.log('📋 Step 4: Verify registration')
    const newSubdomain = await registry.read.resolve([SUBDOMAIN_NAME])
    const [newExists, newOwner, newAddr] = newSubdomain

    if (newExists) {
      console.log('🎉 Subdomain successfully registered!')
      console.log(`   Name: ${SUBDOMAIN_NAME}.${PARENT_DOMAIN}`)
      console.log(`   Owner: ${newOwner}`)
      console.log(`   Resolves to: ${newAddr}`)
      console.log('')

      console.log('📋 Step 5: Set text record (optional)')
      try {
        const textTx = await registry.write.setText([
          SUBDOMAIN_NAME,
          'description',
          `L2 subdomain registered for ${SUBDOMAIN_NAME}.${PARENT_DOMAIN}`,
        ])
        console.log(`📝 Text record transaction: ${textTx}`)
        await publicClient.waitForTransactionReceipt({ hash: textTx })
        console.log('✅ Text record set successfully')
      } catch (error) {
        console.log(
          '⚠️  Text record setting failed (but registration was successful)',
        )
      }

      console.log('')
      console.log('🎯 Testing Instructions:')
      console.log('========================')
      console.log(
        `1. Test in ENS app: https://app.ens.domains/${SUBDOMAIN_NAME}.${PARENT_DOMAIN}`,
      )
      console.log(`2. Test in MetaMask: Send to ${SUBDOMAIN_NAME}.${PARENT_DOMAIN}`)
      console.log(`3. Should resolve to: ${TARGET_ADDRESS}`)
      console.log('')
      console.log('💰 Cost: ~$0.001 vs $20+ on mainnet')
      console.log('⚡ Resolution: Via CCIP Read to Base L2')
    } else {
      console.log('❌ Registration verification failed')
    }
  } catch (error: any) {
    console.error('❌ Registration failed:', error.message)

    if (error.message?.includes('already exists')) {
      console.log('💡 Subdomain already exists - choose a different name')
    } else if (error.message?.includes('Insufficient payment')) {
      console.log('💡 Increase payment amount to cover registration fee')
    } else if (error.message?.includes('reserved')) {
      console.log('💡 This subdomain name is reserved - choose a different one')
    }
  }
}

registerNewSubdomain().catch(console.error)
