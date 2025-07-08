// Based on ENS team's example: https://github.com/ensdomains/docs/blob/master/functions/api/example/basic-gateway.ts
import {
  createPublicClient,
  http,
  decodeFunctionData,
  encodeAbiParameters,
  keccak256,
  Hex,
  parseAbiParameters,
  concat,
  toHex,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import * as dnsPacket from 'dns-packet'
import path from 'path'

// Load .env file from the project root
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

// Environment variables
const L2_REGISTRY_ADDRESS = process.env.L2_REGISTRY_ADDRESS as Hex
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
const GATEWAY_PRIVATE_KEY = process.env.GATEWAY_PRIVATE_KEY as Hex

if (!L2_REGISTRY_ADDRESS || !GATEWAY_PRIVATE_KEY) {
  throw new Error(
    'L2_REGISTRY_ADDRESS and GATEWAY_PRIVATE_KEY must be set in environment',
  )
}

// Viem clients and account
const baseClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
})
const signer = privateKeyToAccount(GATEWAY_PRIVATE_KEY)

// L2 Registry ABI on Base
const L2_REGISTRY_ABI = parseAbi([
  'function resolve(string calldata label) external view returns (bool, address, address)',
  'function getText(string calldata label, string calldata key) external view returns (string memory)',
])

// Resolver ABIs for decoding CCIP-Read requests
const RESOLVER_MAIN_ABI = parseAbi([
  'function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory)',
])
const RESOLVER_CALL_ABI = [
  {
    "type": "function",
    "name": "addr",
    "inputs": [{ "name": "node", "type": "bytes32" }],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "addr",
    "inputs": [
      { "name": "node", "type": "bytes32" },
      { "name": "coinType", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bytes" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "text",
    "inputs": [
      { "name": "node", "type": "bytes32" },
      { "name": "key", "type": "string" }
    ],
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contenthash",
    "inputs": [{ "name": "node", "type": "bytes32" }],
    "outputs": [{ "name": "", "type": "bytes" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pubkey",
    "inputs": [{ "name": "node", "type": "bytes32" }],
    "outputs": [
      { "name": "x", "type": "bytes32" },
      { "name": "y", "type": "bytes32" }
    ],
    "stateMutability": "view"
  }
]

/**
 * @param sender The address of the resolver.
 * @param name The DNS-encoded name.
 * @param data The ABI-encoded calldata for the resolver function (e.g., `addr(bytes32)`).
 * @returns The ABI-encoded signed result for the resolver's callback.
 */
async function resolveAndSign(sender: Hex, name: Hex, data: Hex): Promise<Hex> {
  console.log(`[GW] Received request for name: ${name}`)
  const decodedName = dnsPacket.name.decode(
    Buffer.from(name.substring(2), 'hex'),
  )
  const label = decodedName.split('.')[0]
  if (!label) throw new Error('Could not parse label from name')
  console.log(`[GW] Decoded name "${decodedName}" into label: "${label}"`)

  // --- Start of Diagnostic Log ---
  console.log('[GW] Decoding with ABI:', JSON.stringify(RESOLVER_CALL_ABI, null, 2))
  // ---  End of Diagnostic Log  ---

  const { functionName, args } = decodeFunctionData({
    abi: RESOLVER_CALL_ABI,
    data,
  })
  console.log(`[GW] Decoded inner call: ${functionName}`)

  if (!args) {
    throw new Error('Could not decode function arguments.')
  }

  let resultData: Hex

  if (functionName === 'addr') {
    const coinType = (args as any[]).length > 1 ? args[1] : 60 // Default to ETH coin type (60)

    // Only resolve for ETH (coin type 60)
    if (coinType === 60) {
      console.log(`[GW] Calling L2 registry for ETH address...`)
      const l2Result = await baseClient.readContract({
        address: L2_REGISTRY_ADDRESS,
        abi: L2_REGISTRY_ABI,
        functionName: 'resolve',
        args: [label],
      })
      console.log(`[GW] L2 registry returned:`, l2Result)
      resultData = encodeAbiParameters(parseAbiParameters(['address']), [
        l2Result[2],
      ])
    } else {
      console.log(`[GW] Unsupported coin type ${coinType}, returning empty.`)
      resultData = encodeAbiParameters(parseAbiParameters(['bytes']), ['0x'])
    }
  } else if (functionName === 'text') {
    const [_node, key] = args as [string, string]
    console.log(`[GW] Calling L2 registry for text record "${key}"...`)
    const textResult = await baseClient.readContract({
      address: L2_REGISTRY_ADDRESS,
      abi: L2_REGISTRY_ABI,
      functionName: 'getText',
      args: [label, key],
    })
    console.log(`[GW] L2 registry returned: "${textResult}"`)
    resultData = encodeAbiParameters(parseAbiParameters(['string']), [
      textResult,
    ])
  } else if (functionName === 'contenthash') {
    console.log(`[GW] Unsupported function "${functionName}", returning empty.`)
    resultData = encodeAbiParameters(parseAbiParameters(['bytes']), ['0x'])
  } else if (functionName === 'pubkey') {
    console.log(`[GW] Unsupported function "${functionName}", returning empty.`)
    resultData = encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [{ type: 'bytes32' }, { type: 'bytes32' }],
        },
      ],
      [
        [
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        ],
      ],
    )
  } else {
    throw new Error(`Unsupported function: ${functionName}`)
  }

  const expires = BigInt(Math.floor(Date.now() / 1000) + 300)
  const request = encodeAbiParameters(parseAbiParameters(['bytes', 'bytes']), [
    name,
    data,
  ])
  console.log(`[GW] Signing response...`)

  const domainSeparator = keccak256(toHex('L2CCIPResolver(address,uint64,bytes,bytes)'))
  const structTypeHash = keccak256(
    toHex('resolve(address resolver,uint64 expires,bytes request,bytes result)'),
  )
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint64, bytes32, bytes32'),
      [structTypeHash, sender, expires, keccak256(request), keccak256(resultData)],
    ),
  )
  const messageHash = keccak256(concat(['0x1901', domainSeparator, structHash]))
  const signature = await signer.signMessage({ message: { raw: messageHash } })
  console.log(`[GW] Signature generated.`)

  return encodeAbiParameters(parseAbiParameters('bytes, uint64, bytes'), [
    resultData,
    expires,
    signature,
  ])
}

/**
 * Vercel/Cloudflare compatible serverless function handler.
 */
export default async (req: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  try {
    let sender: Hex | null = null
    let offchainLookupData: Hex | null = null

    if (req.method === 'POST') {
      const body = await req.json()
      sender = body.sender
      offchainLookupData = body.data
    } else {
      const url = new URL(req.url)
      const pathParts = url.pathname.split('/').filter((p) => p) // -> ['', 'sender', 'data'] -> ['sender', 'data']
      if (pathParts.length >= 2) {
        sender = pathParts[0] as Hex
        const data = pathParts[1].startsWith('0x')
          ? pathParts[1]
          : `0x${pathParts[1]}`
        offchainLookupData = data as Hex
      }
    }

    if (!offchainLookupData || !sender) {
      return Response.json(
        { message: 'Missing sender or data in request' },
        { status: 400, headers },
      )
    }

    const { args } = decodeFunctionData({
      abi: RESOLVER_MAIN_ABI,
      data: offchainLookupData as Hex,
    })
    const [name, innerData] = args

    const signedResult = await resolveAndSign(sender, name, innerData)

    return Response.json({ data: signedResult }, { headers })
  } catch (error) {
    console.error('Gateway error:', error)
    return Response.json(
      { message: 'Internal Server Error' },
      { status: 500, headers },
    )
  }
}

// Health check endpoint
export async function onRequestHealth() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    registry: L2_REGISTRY_ADDRESS,
  })
}
