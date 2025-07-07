import { privateKeyToAccount } from 'viem/accounts'
import { Hex } from 'viem'

function getAddressFromPk() {
  const privateKey = process.env.GATEWAY_PRIVATE_KEY as Hex

  if (!privateKey) {
    console.error('Please set the GATEWAY_PRIVATE_KEY environment variable.')
    process.exit(1)
  }

  try {
    const account = privateKeyToAccount(privateKey)
    console.log(account.address)
  } catch (e) {
    console.error('Invalid private key provided.')
    process.exit(1)
  }
}

getAddressFromPk()
