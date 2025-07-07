// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./EIP3668.sol";
import "../resolvers/profiles/IExtendedResolver.sol";
import "../resolvers/profiles/IAddrResolver.sol";
import "../resolvers/profiles/ITextResolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title L2CCIPResolver
 * @dev CCIP Read resolver that defers subdomain resolution to an L2 or off-chain gateway.
 * Implements EIP-3668 (CCIP Read) and ENSIP-10 (Wildcard Resolution).
 */
contract L2CCIPResolver is Ownable, ERC165, IExtendedResolver {
    using ECDSA for bytes32;

    // Events
    event GatewayURLsChanged(string[] newUrls);
    event SignerChanged(address indexed newSigner);

    // State variables
    string[] public gatewayUrls;
    address public trustedSigner; // Address that signs gateway responses

    constructor(string[] memory _gatewayUrls, address _trustedSigner) {
        gatewayUrls = _gatewayUrls;
        trustedSigner = _trustedSigner;
    }

    /**
     * @dev Resolves a name, as specified by ENSIP-10.
     * @param name The DNS-encoded name to resolve.
     * @param data The ABI-encoded data for the underlying resolution function (e.g., addr(bytes32), text(bytes32,string), etc.).
     * @return The return data, ABI-encoded identically to the underlying function.
     */
    function resolve(
        bytes calldata name,
        bytes calldata data
    ) external view override returns (bytes memory) {
        // 1. Encode the call to the gateway's `resolve` function
        bytes memory callData = abi.encodeWithSelector(
            bytes4(keccak256("resolve(bytes,bytes)")), // Standard gateway interface
            name,
            data
        );

        // 2. Revert with OffchainLookup to trigger CCIP Read
        revert OffchainLookup(
            address(this),
            gatewayUrls,
            callData,
            L2CCIPResolver.resolveWithProof.selector,
            abi.encode(name, data) // Pass original calldata to callback
        );
    }

    /**
     * @dev Callback function used by CCIP clients to verify and parse the gateway's response.
     * @param response The response from the gateway, containing (result, expires, signature).
     * @param extraData The data passed from the `resolve` function, containing (name, data).
     * @return The ABI-encoded result of the resolution.
     */
    function resolveWithProof(
        bytes calldata response,
        bytes calldata extraData
    ) external view returns (bytes memory) {
        // 1. Decode the gateway's response
        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(
            response,
            (bytes, uint64, bytes)
        );

        // 2. Verify the timestamp
        require(block.timestamp <= expires, "L2CCIPResolver: Stale response");

        // 3. Verify the signature
        bytes32 messageHash = makeSignatureHash(expires, extraData, result);
        address signer = messageHash.recover(sig);
        require(signer == trustedSigner, "L2CCIPResolver: Invalid signature");

        // 4. Return the result
        return result;
    }

    /**
     * @dev Creates the EIP-712 style digest to be signed by the gateway.
     * @param expires The UNIX timestamp when the signature expires.
     * @param request The ABI-encoded request data (`resolve(name, data)` calldata).
     * @param result The ABI-encoded result data.
     * @return The hash to be signed.
     */
    function makeSignatureHash(
        uint64 expires,
        bytes memory request,
        bytes memory result
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    keccak256("L2CCIPResolver(uint64,bytes,bytes)"),
                    keccak256(
                        abi.encode(
                            keccak256(
                                "resolve(uint64 expires,bytes request,bytes result)"
                            ),
                            expires,
                            keccak256(request),
                            keccak256(result)
                        )
                    )
                )
            );
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId ||
            interfaceId == type(IAddrResolver).interfaceId ||
            interfaceId == type(ITextResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // --- Admin functions ---

    function setGatewayUrls(string[] memory _gatewayUrls) external onlyOwner {
        gatewayUrls = _gatewayUrls;
        emit GatewayURLsChanged(_gatewayUrls);
    }

    function setTrustedSigner(address _trustedSigner) external onlyOwner {
        trustedSigner = _trustedSigner;
        emit SignerChanged(_trustedSigner);
    }
}
