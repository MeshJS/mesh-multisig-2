use cardano/address.{Address, Credential}
use cardano/assets.{Lovelace, PolicyId}
use cardano/governance.{GovernanceActionId}

pub type CrowdfundGovRedeemer {
  ContributeFund
  ContributorWithdrawal
  RegisterCerts
  ProposeGovAction
  VoteOnGovAction
  DeregisterCerts
  RemoveEmptyInstance
}

pub type CrowdfundGovDatum {
  crowdfund_state: CrowdfundState,
  crowdfund_param: CrowdfundParam,
}

pub type CrowdfundParam {
  auth_token: PolicyId,
  proposer_key_hash: ByteArray,
  gov_action_hash: ByteArray,
  delegate_pool_id: ByteArray,
  // dynamic deposit parameters to avoid hardcoding values
  stake_register_deposit: Lovelace,
  drep_register_deposit: Lovelace,
  gov_deposit: Lovelace,
}

pub type CrowdfundState {
  Crowdfund {
    stake_cred: Credential,
    share_token: ByteArray,
    crowdfund_address: Address,
    fundraise_target: Int,
    current_fundraised_amount: Int,
    allow_over_subscription: Bool,
    deadline: Int,
    expiry_buffer: Int,
    min_charge: Int,
  }
  Proposed {
    stake_cred: Credential,
    share_token: ByteArray,
    funds_controlled: Int,
    deadline: Int,
  }
  Voted {
    stake_cred: Credential,
    share_token: ByteArray,
    funds_controlled: Int,
    gov_tx_id: GovernanceActionId,
    deadline: Int,
  }
  Refundable {
    stake_cred: Credential,
    share_token: ByteArray,
    funds_controlled: Int,
  }
}

pub type MintPolarity {
  RMint
  RBurn
}

pub type PublishRedeemer {
  Register
  Deregister
}
