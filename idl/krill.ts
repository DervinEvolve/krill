/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/krill.json`.
 */
export type Krill = {
  "address": "4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA",
  "metadata": {
    "name": "krill",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Quadratic-voting DAO treasury with milestone escrow, in native SOL",
    "repository": "https://github.com/DervinEvolve/krill"
  },
  "instructions": [
    {
      "name": "approveMilestone",
      "docs": [
        "Council accepts a delivery and pays the contractor."
      ],
      "discriminator": [
        145,
        85,
        92,
        60,
        50,
        130,
        219,
        106
      ],
      "accounts": [
        {
          "name": "council",
          "signer": true,
          "relations": [
            "dao"
          ]
        },
        {
          "name": "dao",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.authority",
                "account": "dao"
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "dao"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "docs": [
            "Mutable because releasing the last milestone completes the proposal."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "account",
                "path": "proposal.index",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "proposal"
              }
            ]
          }
        },
        {
          "name": "contractor",
          "writable": true,
          "relations": [
            "escrow"
          ]
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cancelEscrow",
      "docs": [
        "Council cancels the escrow and refunds the unpaid remainder to the pool."
      ],
      "discriminator": [
        156,
        203,
        54,
        179,
        38,
        72,
        33,
        21
      ],
      "accounts": [
        {
          "name": "council",
          "signer": true,
          "relations": [
            "dao"
          ]
        },
        {
          "name": "dao",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.authority",
                "account": "dao"
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "dao"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "account",
                "path": "proposal.index",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "proposal"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "castVote",
      "docs": [
        "Burns credits for quadratic votes for or against a proposal."
      ],
      "discriminator": [
        20,
        212,
        15,
        189,
        69,
        180,
        69,
        151
      ],
      "accounts": [
        {
          "name": "voter",
          "docs": [
            "Pays the receipt rent on a first vote."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "member",
          "docs": [
            "Seeds prove the voter is a member of the proposal's DAO."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "proposal.dao",
                "account": "proposal"
              },
              {
                "kind": "account",
                "path": "voter"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.dao",
                "account": "proposal"
              },
              {
                "kind": "account",
                "path": "proposal.index",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "receipt",
          "docs": [
            "Created on the first vote and topped up on later ones, so the square",
            "root always applies to the voter's cumulative credits."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "proposal"
              },
              {
                "kind": "account",
                "path": "voter"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "credits",
          "type": "u64"
        },
        {
          "name": "support",
          "type": "bool"
        }
      ]
    },
    {
      "name": "createProposal",
      "docs": [
        "Opens a milestone-based spending proposal for voting."
      ],
      "discriminator": [
        132,
        116,
        68,
        174,
        216,
        160,
        198,
        22
      ],
      "accounts": [
        {
          "name": "proposer",
          "docs": [
            "Pays the proposal rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "dao",
          "docs": [
            "Mutable because it hands out the proposal index."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.authority",
                "account": "dao"
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "dao"
              }
            ]
          }
        },
        {
          "name": "member",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "account",
                "path": "proposer"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "account",
                "path": "dao.proposalCount",
                "account": "dao"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "contractor",
          "type": "pubkey"
        },
        {
          "name": "milestones",
          "type": {
            "vec": "u64"
          }
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "Adds lamports to the treasury in exchange for more voice credits."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "dao",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.authority",
                "account": "dao"
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "dao"
              }
            ]
          }
        },
        {
          "name": "member",
          "docs": [
            "Seeds tie the membership to both this DAO and the signing wallet."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "execute",
      "docs": [
        "Locks a passed proposal's funds in its escrow."
      ],
      "discriminator": [
        130,
        221,
        242,
        154,
        13,
        193,
        189,
        29
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "dao",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.authority",
                "account": "dao"
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "dao"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "account",
                "path": "proposal.index",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "docs": [
            "`init` also makes a second execute impossible."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "proposal"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "finalize",
      "docs": [
        "Closes voting after the deadline and records the outcome."
      ],
      "discriminator": [
        171,
        61,
        218,
        56,
        127,
        115,
        12,
        217
      ],
      "accounts": [
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "proposal.dao",
                "account": "proposal"
              },
              {
                "kind": "account",
                "path": "proposal.index",
                "account": "proposal"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "initializeDao",
      "docs": [
        "Creates a DAO (and its treasury) with its governance parameters."
      ],
      "discriminator": [
        128,
        226,
        96,
        90,
        39,
        56,
        24,
        196
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Pays rent and becomes part of the DAO's address."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "dao",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "council",
          "type": "pubkey"
        },
        {
          "name": "votingPeriod",
          "type": "i64"
        },
        {
          "name": "quorumBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "join",
      "docs": [
        "Becomes a member with a first deposit of at least one credit."
      ],
      "discriminator": [
        206,
        55,
        2,
        106,
        113,
        220,
        17,
        163
      ],
      "accounts": [
        {
          "name": "wallet",
          "docs": [
            "The new member; pays the deposit and the membership rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "dao",
          "docs": [
            "Receives the deposit: the DAO account is the treasury."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.authority",
                "account": "dao"
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "dao"
              }
            ]
          }
        },
        {
          "name": "member",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "dao"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "deposit",
          "type": "u64"
        }
      ]
    },
    {
      "name": "rejectMilestone",
      "docs": [
        "Council sends a delivery back for rework."
      ],
      "discriminator": [
        243,
        48,
        66,
        165,
        237,
        41,
        116,
        249
      ],
      "accounts": [
        {
          "name": "council",
          "signer": true,
          "relations": [
            "dao"
          ]
        },
        {
          "name": "dao",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "dao.authority",
                "account": "dao"
              },
              {
                "kind": "account",
                "path": "dao.name",
                "account": "dao"
              }
            ]
          },
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.proposal",
                "account": "escrow"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "submitMilestone",
      "docs": [
        "Contractor marks the next milestone as delivered."
      ],
      "discriminator": [
        35,
        96,
        220,
        215,
        102,
        83,
        139,
        52
      ],
      "accounts": [
        {
          "name": "contractor",
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.proposal",
                "account": "escrow"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "dao",
      "discriminator": [
        163,
        9,
        47,
        31,
        52,
        85,
        197,
        49
      ]
    },
    {
      "name": "escrow",
      "discriminator": [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    },
    {
      "name": "member",
      "discriminator": [
        54,
        19,
        162,
        21,
        29,
        166,
        17,
        198
      ]
    },
    {
      "name": "proposal",
      "discriminator": [
        26,
        94,
        189,
        187,
        116,
        136,
        53,
        33
      ]
    },
    {
      "name": "voteReceipt",
      "discriminator": [
        104,
        20,
        204,
        252,
        45,
        84,
        37,
        195
      ]
    }
  ],
  "events": [
    {
      "name": "milestoneReleased",
      "discriminator": [
        49,
        225,
        91,
        223,
        34,
        165,
        109,
        181
      ]
    },
    {
      "name": "proposalCreated",
      "discriminator": [
        186,
        8,
        160,
        108,
        81,
        13,
        51,
        206
      ]
    },
    {
      "name": "proposalFinalized",
      "discriminator": [
        159,
        104,
        210,
        220,
        86,
        209,
        61,
        51
      ]
    },
    {
      "name": "voteCast",
      "discriminator": [
        39,
        53,
        195,
        104,
        188,
        17,
        225,
        213
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "nameTooLong",
      "msg": "DAO name must be between 1 and 32 bytes"
    },
    {
      "code": 6001,
      "name": "titleTooLong",
      "msg": "Proposal title must be between 1 and 64 bytes"
    },
    {
      "code": 6002,
      "name": "invalidVotingPeriod",
      "msg": "Voting period must be a positive number of seconds"
    },
    {
      "code": 6003,
      "name": "invalidQuorum",
      "msg": "Quorum must be between 0 and 10000 basis points"
    },
    {
      "code": 6004,
      "name": "depositTooSmall",
      "msg": "Deposit at least 1_000_000 lamports (one voice credit)"
    },
    {
      "code": 6005,
      "name": "invalidMilestones",
      "msg": "Provide 1 to 8 milestones, each with a non-zero lamport amount"
    },
    {
      "code": 6006,
      "name": "insufficientTreasury",
      "msg": "The treasury does not hold enough unallocated lamports for this amount"
    },
    {
      "code": 6007,
      "name": "invalidState",
      "msg": "This action is not allowed in the account's current state"
    },
    {
      "code": 6008,
      "name": "votingClosed",
      "msg": "Voting on this proposal has ended; call finalize instead"
    },
    {
      "code": 6009,
      "name": "votingStillOpen",
      "msg": "Voting is still open; wait until the voting period ends"
    },
    {
      "code": 6010,
      "name": "insufficientCredits",
      "msg": "Vote with at least one credit and no more than you hold"
    },
    {
      "code": 6011,
      "name": "cannotSwitchSides",
      "msg": "You already voted on the other side of this proposal"
    },
    {
      "code": 6012,
      "name": "milestoneOutOfOrder",
      "msg": "Milestones are delivered in order; the previous one must be released first"
    },
    {
      "code": 6013,
      "name": "milestoneIndexOutOfRange",
      "msg": "Milestone index is past the last milestone of this escrow"
    },
    {
      "code": 6014,
      "name": "overflow",
      "msg": "Arithmetic overflow; the amounts involved are unrealistically large"
    },
    {
      "code": 6015,
      "name": "invalidContractor",
      "msg": "Contractor must be a wallet that can sign and receive SOL, not a Krill account or program"
    }
  ],
  "types": [
    {
      "name": "dao",
      "docs": [
        "A DAO and its treasury in one account: pooled lamports sit on this PDA, so",
        "there is no separate vault to secure. Seeds: `[\"dao\", authority, name]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Created the DAO. Part of the address, but holds no special powers."
            ],
            "type": "pubkey"
          },
          {
            "name": "council",
            "docs": [
              "Reviews milestone deliveries and may cancel an escrow."
            ],
            "type": "pubkey"
          },
          {
            "name": "name",
            "docs": [
              "Human-readable name, also a PDA seed so one authority can run many DAOs."
            ],
            "type": "string"
          },
          {
            "name": "votingPeriod",
            "docs": [
              "Seconds a proposal stays open for voting."
            ],
            "type": "i64"
          },
          {
            "name": "quorumBps",
            "docs": [
              "Share of all credits ever minted that a proposal must burn to be valid."
            ],
            "type": "u16"
          },
          {
            "name": "pooledLamports",
            "docs": [
              "Spendable treasury. Tracked apart from the account balance so the",
              "rent-exempt reserve can never be voted away."
            ],
            "type": "u64"
          },
          {
            "name": "totalCredits",
            "docs": [
              "Credits ever minted; the base for quorum snapshots."
            ],
            "type": "u64"
          },
          {
            "name": "memberCount",
            "docs": [
              "Members who have joined; informational, never used for voting power."
            ],
            "type": "u64"
          },
          {
            "name": "proposalCount",
            "docs": [
              "Index of the next proposal, also its PDA seed."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "escrow",
      "docs": [
        "Funds locked for a passed proposal. The account holds the lamports itself",
        "(on top of its rent reserve), so once executed the money is out of the",
        "treasury's reach and can only go to the contractor or back to the pool.",
        "Seeds: `[\"escrow\", proposal]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "contractor",
            "type": "pubkey"
          },
          {
            "name": "dao",
            "type": "pubkey"
          },
          {
            "name": "milestones",
            "type": {
              "vec": {
                "defined": {
                  "name": "milestone"
                }
              }
            }
          },
          {
            "name": "releasedLamports",
            "docs": [
              "Lamports already paid to the contractor."
            ],
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "escrowState"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "escrowState",
      "docs": [
        "Lifecycle of an escrow: it ends either paid out or cancelled."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "member",
      "docs": [
        "A wallet's stake in one DAO. Seeds: `[\"member\", dao, wallet]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dao",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "docs": [
              "The only signer allowed to deposit or vote with this membership."
            ],
            "type": "pubkey"
          },
          {
            "name": "credits",
            "docs": [
              "Unspent voice credits. Voting burns them; they never come back."
            ],
            "type": "u64"
          },
          {
            "name": "deposited",
            "docs": [
              "Lifetime lamports deposited, for display and audits."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "milestone",
      "docs": [
        "A slice of the escrowed amount, paid when the council approves delivery."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "milestoneStatus"
              }
            }
          }
        ]
      }
    },
    {
      "name": "milestoneReleased",
      "docs": [
        "The council approved a milestone and `amount` lamports reached the contractor."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "milestoneStatus",
      "docs": [
        "Delivery status of one milestone. Rejection sends a submission back to",
        "`Pending` so the contractor can resubmit."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "submitted"
          },
          {
            "name": "released"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "docs": [
        "A request to pay `contractor` from the treasury, in milestones, if the",
        "members vote for it. Seeds: `[\"proposal\", dao, index.to_le_bytes()]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dao",
            "type": "pubkey"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "contractor",
            "docs": [
              "Receives the milestone payouts once the proposal is executed."
            ],
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "amount",
            "docs": [
              "Lamports requested; always equal to the sum of `milestones`."
            ],
            "type": "u64"
          },
          {
            "name": "milestones",
            "docs": [
              "Lamports paid per milestone, in delivery order."
            ],
            "type": {
              "vec": "u64"
            }
          },
          {
            "name": "votingEndsAt",
            "docs": [
              "Unix timestamp at which voting closes and `finalize` becomes possible."
            ],
            "type": "i64"
          },
          {
            "name": "quorumCredits",
            "docs": [
              "Credits that must be burned for the result to count, frozen at creation."
            ],
            "type": "u64"
          },
          {
            "name": "creditsSpent",
            "docs": [
              "Every credit burned on this proposal, on either side."
            ],
            "type": "u64"
          },
          {
            "name": "forVotes",
            "docs": [
              "Tallies in `VOTE_SCALE` fixed point."
            ],
            "type": "u128"
          },
          {
            "name": "againstVotes",
            "type": "u128"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "proposalState"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proposalCreated",
      "docs": [
        "A new proposal opened for voting."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "proposalFinalized",
      "docs": [
        "Voting closed; `passed` is the outcome, with the final tallies."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "passed",
            "type": "bool"
          },
          {
            "name": "forVotes",
            "type": "u128"
          },
          {
            "name": "againstVotes",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "proposalState",
      "docs": [
        "Lifecycle of a proposal. See the state machine in the README: every arrow",
        "is one method on [`Proposal`], so each transition is checked in one place."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "voting"
          },
          {
            "name": "passed"
          },
          {
            "name": "rejected"
          },
          {
            "name": "escrowed"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "voteCast",
      "docs": [
        "One per `cast_vote`. `credits` are the credits burned by this transaction",
        "and `votes` the voting power it added, so summing `votes` per side",
        "reproduces the on-chain tally exactly."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "voter",
            "type": "pubkey"
          },
          {
            "name": "credits",
            "type": "u64"
          },
          {
            "name": "votes",
            "type": "u128"
          },
          {
            "name": "support",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "voteReceipt",
      "docs": [
        "One voter's cumulative stake in one proposal.",
        "Seeds: `[\"vote\", proposal, voter]`.",
        "",
        "The receipt exists so that the square root is always taken over the",
        "voter's *total* credits. Without it, voting 1 credit a thousand times",
        "would buy 1_000 votes instead of the ~31.6 that 1_000 credits are worth."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "voter",
            "type": "pubkey"
          },
          {
            "name": "support",
            "docs": [
              "Side chosen on the first vote; fixed for the receipt's lifetime."
            ],
            "type": "bool"
          },
          {
            "name": "credits",
            "docs": [
              "Credits this voter has burned on this proposal so far."
            ],
            "type": "u64"
          },
          {
            "name": "votes",
            "docs": [
              "`votes_for(credits)`: the voter's current weight in the tally."
            ],
            "type": "u128"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "bpsDenominator",
      "docs": [
        "Basis points in 100%, the denominator for `quorum_bps`."
      ],
      "type": "u64",
      "value": "10000"
    },
    {
      "name": "daoSeed",
      "docs": [
        "PDA seed prefixes, one per account type, so addresses never collide."
      ],
      "type": "bytes",
      "value": "[100, 97, 111]"
    },
    {
      "name": "escrowSeed",
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119]"
    },
    {
      "name": "lamportsPerCredit",
      "docs": [
        "Lamports that buy one voice credit (0.001 SOL). Coarse enough that credit",
        "counts stay small and readable, fine enough that a 1 SOL member gets 1_000."
      ],
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "maxMilestones",
      "docs": [
        "Upper bound on milestones per proposal; keeps escrow accounts fixed-size."
      ],
      "type": "u8",
      "value": "8"
    },
    {
      "name": "maxNameLen",
      "docs": [
        "DAO names are a PDA seed, and a single seed may not exceed 32 bytes."
      ],
      "type": "u8",
      "value": "32"
    },
    {
      "name": "maxTitleLen",
      "docs": [
        "Titles are stored inline in the proposal; 64 bytes fits a headline."
      ],
      "type": "u8",
      "value": "64"
    },
    {
      "name": "memberSeed",
      "type": "bytes",
      "value": "[109, 101, 109, 98, 101, 114]"
    },
    {
      "name": "proposalSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 112, 111, 115, 97, 108]"
    },
    {
      "name": "voteScale",
      "docs": [
        "Votes are fixed-point with 9 decimals, so `1.5` votes is `1_500_000_000`."
      ],
      "type": "u128",
      "value": "1000000000"
    },
    {
      "name": "voteSeed",
      "type": "bytes",
      "value": "[118, 111, 116, 101]"
    }
  ]
};
