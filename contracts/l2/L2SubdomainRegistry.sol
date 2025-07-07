// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title L2SubdomainRegistry
 * @dev Manages subdomains on an L2 for a parent domain on L1.
 * Users can register subdomains (e.g., user1.parent.eth) cheaply on L2.
 */
contract L2SubdomainRegistry is Ownable, ReentrancyGuard {
    // Events
    event SubdomainRegistered(
        string indexed label,
        address indexed owner,
        address resolver,
        uint256 timestamp
    );

    event SubdomainUpdated(
        string indexed label,
        address indexed owner,
        address newAddress,
        uint256 timestamp
    );

    event TextRecordSet(
        string indexed label,
        string indexed key,
        string value,
        uint256 timestamp
    );

    event SubdomainTransferred(
        string indexed label,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    // Structs
    struct SubdomainRecord {
        address owner; // Who owns this subdomain
        address resolvedAddress; // ETH address this subdomain points to
        uint256 registeredAt; // When it was registered
        bool exists; // Whether it exists
    }

    // State variables
    mapping(string => SubdomainRecord) public subdomains;
    mapping(string => mapping(string => string)) public textRecords; // label => key => value
    mapping(address => string[]) public userSubdomains; // owner => list of their subdomains

    string public parentDomain;
    uint256 public registrationFee;
    bool public registrationOpen = true;

    // Reserved/blocked subdomains
    mapping(string => bool) public reserved;

    constructor(string memory _parentDomain, uint256 _registrationFee) {
        parentDomain = _parentDomain;
        registrationFee = _registrationFee;
        // Reserve some common subdomains
        reserved["www"] = true;
        reserved["mail"] = true;
        reserved["admin"] = true;
        reserved["api"] = true;
        reserved["app"] = true;
    }

    modifier onlySubdomainOwner(string memory label) {
        require(subdomains[label].exists, "Subdomain does not exist");
        require(subdomains[label].owner == msg.sender, "Not subdomain owner");
        _;
    }

    modifier validLabel(string memory label) {
        require(bytes(label).length >= 3, "Label too short");
        require(bytes(label).length <= 63, "Label too long");
        require(!reserved[label], "Label is reserved");
        // Add more validation as needed (alphanumeric, etc.)
        _;
    }

    /**
     * @dev Register a new subdomain (e.g., user1.parent.eth)
     * @param label The subdomain label (e.g., "user1")
     * @param targetAddress The address this subdomain should resolve to
     */
    function registerSubdomain(
        string memory label,
        address targetAddress
    ) external payable nonReentrant validLabel(label) {
        require(registrationOpen, "Registration is closed");
        require(!subdomains[label].exists, "Subdomain already exists");
        require(msg.value >= registrationFee, "Insufficient payment");
        require(targetAddress != address(0), "Invalid target address");

        // Create the subdomain record
        subdomains[label] = SubdomainRecord({
            owner: msg.sender,
            resolvedAddress: targetAddress,
            registeredAt: block.timestamp,
            exists: true
        });

        // Add to user's subdomain list
        userSubdomains[msg.sender].push(label);

        emit SubdomainRegistered(
            label,
            msg.sender,
            targetAddress,
            block.timestamp
        );
    }

    /**
     * @dev Update the address a subdomain points to
     * @param label The subdomain label
     * @param newAddress The new address
     */
    function setAddress(
        string memory label,
        address newAddress
    ) external onlySubdomainOwner(label) {
        require(newAddress != address(0), "Invalid address");

        subdomains[label].resolvedAddress = newAddress;
        emit SubdomainUpdated(label, msg.sender, newAddress, block.timestamp);
    }

    /**
     * @dev Set a text record for a subdomain
     * @param label The subdomain label
     * @param key The record key (e.g., "description", "url", "avatar")
     * @param value The record value
     */
    function setText(
        string memory label,
        string memory key,
        string memory value
    ) external onlySubdomainOwner(label) {
        textRecords[label][key] = value;
        emit TextRecordSet(label, key, value, block.timestamp);
    }

    /**
     * @dev Transfer subdomain ownership
     * @param label The subdomain label
     * @param newOwner The new owner address
     */
    function transferSubdomain(
        string memory label,
        address newOwner
    ) external onlySubdomainOwner(label) {
        require(newOwner != address(0), "Invalid new owner");

        address oldOwner = subdomains[label].owner;
        subdomains[label].owner = newOwner;

        // Update user subdomain lists
        _removeFromUserList(oldOwner, label);
        userSubdomains[newOwner].push(label);

        emit SubdomainTransferred(label, oldOwner, newOwner, block.timestamp);
    }

    /**
     * @dev Get subdomain information
     * @param label The subdomain label
     * @return owner The owner address
     * @return resolvedAddress The address it resolves to
     * @return registeredAt When it was registered
     * @return exists Whether it exists
     */
    function getSubdomain(
        string memory label
    )
        external
        view
        returns (
            address owner,
            address resolvedAddress,
            uint256 registeredAt,
            bool exists
        )
    {
        SubdomainRecord memory record = subdomains[label];
        return (
            record.owner,
            record.resolvedAddress,
            record.registeredAt,
            record.exists
        );
    }

    /**
     * @dev Get text record for a subdomain
     * @param label The subdomain label
     * @param key The record key
     * @return The record value
     */
    function getText(
        string memory label,
        string memory key
    ) external view returns (string memory) {
        return textRecords[label][key];
    }

    /**
     * @dev Get all subdomains owned by an address
     * @param owner The owner address
     * @return Array of subdomain labels
     */
    function getUserSubdomains(
        address owner
    ) external view returns (string[] memory) {
        return userSubdomains[owner];
    }

    /**
     * @dev Check if a subdomain exists and get its resolved address
     * This is the main function the gateway will call
     * @param label The subdomain label
     * @return exists Whether the subdomain exists
     * @return owner The owner of the subdomain
     * @return resolvedAddress The address it resolves to
     */
    function resolve(
        string memory label
    )
        external
        view
        returns (bool exists, address owner, address resolvedAddress)
    {
        SubdomainRecord memory record = subdomains[label];
        return (record.exists, record.owner, record.resolvedAddress);
    }

    // Admin functions
    function setRegistrationFee(uint256 newFee) external onlyOwner {
        registrationFee = newFee;
    }

    function setRegistrationOpen(bool open) external onlyOwner {
        registrationOpen = open;
    }

    function reserveLabel(
        string memory label,
        bool reserve
    ) external onlyOwner {
        reserved[label] = reserve;
    }

    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Internal helper functions
    function _removeFromUserList(address user, string memory label) internal {
        string[] storage userList = userSubdomains[user];
        for (uint i = 0; i < userList.length; i++) {
            if (keccak256(bytes(userList[i])) == keccak256(bytes(label))) {
                userList[i] = userList[userList.length - 1];
                userList.pop();
                break;
            }
        }
    }
}
