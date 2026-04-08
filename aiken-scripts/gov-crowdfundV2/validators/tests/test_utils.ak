use aiken/cbor
use aiken/collection/list
use aiken/crypto.{blake2b_256}
use cardano/address.{
  Address, Credential, Inline, Script, VerificationKey, from_script,
}
use cardano/governance.{
  GovernanceActionId, NicePoll, ProposalProcedure, TreasuryWithdrawal, Vote,
  Voter,
}
use cardano/transaction.{Transaction}
use mocktail.{
  mock_policy_id, mock_pub_key_hash, mock_script_hash,
  mock_script_stake_key_hash, mock_tx_hash,
}
use types.{Crowdfund, CrowdfundGovDatum, CrowdfundParam}

pub const mock_auth_token = mock_policy_id(0)

pub const mock_share_token = mock_policy_id(1)

pub const mock_completion_script = mock_script_hash(0)

pub const mock_crowdfund_spend_script_hash = mock_script_hash(1)

pub const mock_crowdfund_stake_script_hash = mock_script_stake_key_hash(0)

pub const mock_crowdfund_address = from_script(mock_crowdfund_spend_script_hash)

pub const mock_fee_address = from_script("fee_address")

pub const mock_fundraise_target = 100000000000

pub const mock_extra_fundraised_amount = 4000000

pub const mock_min_charge = 10

pub const mock_current_fundraised_amount =
  mock_fundraise_target + mock_extra_fundraised_amount + mock_min_charge

pub const mock_contribute_min_fundraised_amount = 2000000

pub const mock_contribute_over_fundraised_amount =
  mock_fundraise_target + mock_contribute_min_fundraised_amount

pub const mock_deadline = 1750735607

pub const mock_expiry_buffer = 3600 * 24

pub fn mock_crowdfund_datum(
  current_fundraised_amount: Int,
  allow_over_subscription: Bool,
) -> CrowdfundGovDatum {
  CrowdfundGovDatum {
    crowdfund_state: Crowdfund {
      stake_cred: mock_stake_cred,
      share_token: mock_share_token,
      crowdfund_address: mock_crowdfund_address,
      fundraise_target: mock_fundraise_target,
      current_fundraised_amount,
      allow_over_subscription,
      deadline: mock_deadline,
      expiry_buffer: mock_expiry_buffer,
      min_charge: mock_min_charge,
    },
    crowdfund_param: CrowdfundParam {
      auth_token: mock_auth_token,
      proposer_key_hash: mock_proposer_key_hash,
      gov_action_hash: mock_gov_action_hash(),
      delegate_pool_id: mock_delegate_pool_id,
      stake_register_deposit: mock_stake_register_deposit,
      drep_register_deposit: mock_drep_register_deposit,
      gov_deposit: mock_gov_deposit,
    },
  }
}

pub const mock_stake_hash = mock_script_hash(0)

pub const mock_stake_cred = Script(mock_stake_hash)

pub const mock_spend_script_hash = mock_script_hash(1)

pub const mock_crowdfund_gov_address = from_script(mock_spend_script_hash)

pub const mock_gov_address =
  Address {
    payment_credential: Script(mock_spend_script_hash),
    stake_credential: Some(Inline(Script(mock_stake_hash))),
  }

/// Address with same payment script as mock_gov_address but custom stake credential (for credential_matches_datum).
pub fn mock_gov_address_with_stake(stake_cred: Credential) -> Address {
  Address {
    payment_credential: Script(mock_spend_script_hash),
    stake_credential: Some(Inline(stake_cred)),
  }
}

pub const mock_gov_action_period = 3600

pub const mock_delegate_pool_id = mock_script_hash(3)

pub fn mock_gov_action_hash() -> ByteArray {
  blake2b_256(cbor.serialise(NicePoll))
}

pub const mock_proposer_key_hash = mock_pub_key_hash(0)

pub const mock_stake_register_deposit = 2000000

pub const mock_drep_register_deposit = 500000000

pub const mock_gov_deposit = 100000000000

pub const mock_funds_controlled =
  mock_fundraise_target + mock_stake_register_deposit + mock_drep_register_deposit + 1000000

pub const mock_gov_action_id =
  GovernanceActionId { transaction: mock_tx_hash(0), proposal_procedure: 0 }

pub const mock_crowdfund_param =
  CrowdfundParam {
    auth_token: mock_auth_token,
    proposer_key_hash: mock_proposer_key_hash,
    gov_action_hash: mock_gov_action_hash(),
    delegate_pool_id: mock_delegate_pool_id,
    stake_register_deposit: mock_stake_register_deposit,
    drep_register_deposit: mock_drep_register_deposit,
    gov_deposit: mock_gov_deposit,
  }

pub fn add_proposal_procedure(
  tx: Transaction,
  condition: Bool,
  proposal_procedure: ProposalProcedure,
) -> Transaction {
  if !condition {
    tx
  } else {
    Transaction {
      ..tx,
      proposal_procedures: tx.proposal_procedures
        |> list.concat([proposal_procedure]),
    }
  }
}

pub fn add_vote(
  tx: Transaction,
  condition: Bool,
  vote: Pair<Voter, Pairs<GovernanceActionId, Vote>>,
) -> Transaction {
  if !condition {
    tx
  } else {
    Transaction {
      ..tx,
      votes: tx.votes
        |> list.concat([vote]),
    }
  }
}

test mock_treasury_withdrawal_gov_action_id() {
  let a =
    TreasuryWithdrawal {
      beneficiaries: [Pair(VerificationKey(mock_pub_key_hash(1)), 1000000)],
      guardrails: Some(
        #"b73c484b015973259b2e4a20ce247bf8df9aae916991c44c1bf9fb2e",
      ),
    }
  trace blake2b_256(cbor.serialise(a))
  let b = NicePoll
  trace blake2b_256(cbor.serialise(b))
  True
}

test mock_crowdfund_datum_test() {
  let datum = mock_crowdfund_datum(1, False)
  trace cbor.serialise(datum)
  True
}
