//! Isolated feasibility laboratory, never the application crypto adapter.
//! Credentials are synthetic labels, not authenticated account/device bindings.
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use openmls_traits::OpenMlsProvider;
use tls_codec::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const SUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
fn error() -> JsError {
    JsError::new("MLS laboratory operation rejected")
}

#[wasm_bindgen]
pub struct Client {
    provider: OpenMlsRustCrypto,
    signer: SignatureKeyPair,
    credential: CredentialWithKey,
    group: Option<MlsGroup>,
}
#[wasm_bindgen]
impl Client {
    #[wasm_bindgen(constructor)]
    pub fn new(label: &str) -> Result<Client, JsError> {
        if label.is_empty() || label.len() > 128 {
            return Err(error());
        }
        let provider = OpenMlsRustCrypto::default();
        let signer = SignatureKeyPair::new(SUITE.signature_algorithm()).map_err(|_| error())?;
        signer.store(provider.storage()).map_err(|_| error())?;
        let credential = CredentialWithKey {
            credential: BasicCredential::new(label.as_bytes().to_vec()).into(),
            signature_key: signer.public().into(),
        };
        Ok(Client {
            provider,
            signer,
            credential,
            group: None,
        })
    }
    pub fn key_package(&self) -> Result<Vec<u8>, JsError> {
        KeyPackage::builder()
            .build(SUITE, &self.provider, &self.signer, self.credential.clone())
            .map_err(|_| error())?
            .key_package()
            .tls_serialize_detached()
            .map_err(|_| error())
    }
    pub fn create(&mut self, id: &[u8]) -> Result<(), JsError> {
        if self.group.is_some() || id.len() < 16 || id.len() > 255 {
            return Err(error());
        }
        let config = MlsGroupCreateConfig::builder()
            .ciphersuite(SUITE)
            .use_ratchet_tree_extension(true)
            .build();
        self.group = Some(
            MlsGroup::new_with_group_id(
                &self.provider,
                &self.signer,
                &config,
                GroupId::from_slice(id),
                self.credential.clone(),
            )
            .map_err(|_| error())?,
        );
        Ok(())
    }
    pub fn add(&mut self, bytes: &[u8]) -> Result<AddResult, JsError> {
        let mut input = bytes;
        let package = KeyPackageIn::tls_deserialize(&mut input)
            .map_err(|_| error())?
            .validate(self.provider.crypto(), ProtocolVersion::Mls10)
            .map_err(|_| error())?;
        if !input.is_empty() {
            return Err(error());
        }
        let group = self.group.as_mut().ok_or_else(error)?;
        let (commit, welcome, _) = group
            .add_members(&self.provider, &self.signer, &[package])
            .map_err(|_| error())?;
        Ok(AddResult {
            commit: commit.tls_serialize_detached().map_err(|_| error())?,
            welcome: welcome.tls_serialize_detached().map_err(|_| error())?,
        })
    }
    pub fn merge_pending(&mut self) -> Result<(), JsError> {
        self.group
            .as_mut()
            .ok_or_else(error)?
            .merge_pending_commit(&self.provider)
            .map_err(|_| error())
    }
    pub fn discard_pending(&mut self) -> Result<(), JsError> {
        self.group
            .as_mut()
            .ok_or_else(error)?
            .clear_pending_commit(self.provider.storage())
            .map_err(|_| error())
    }
    pub fn join(&mut self, bytes: &[u8]) -> Result<(), JsError> {
        if self.group.is_some() {
            return Err(error());
        }
        let mut input = bytes;
        let message = MlsMessageIn::tls_deserialize(&mut input).map_err(|_| error())?;
        if !input.is_empty() {
            return Err(error());
        }
        let MlsMessageBodyIn::Welcome(welcome) = message.extract() else {
            return Err(error());
        };
        let config = MlsGroupJoinConfig::builder().build();
        self.group = Some(
            StagedWelcome::new_from_welcome(&self.provider, &config, welcome, None)
                .map_err(|_| error())?
                .into_group(&self.provider)
                .map_err(|_| error())?,
        );
        Ok(())
    }
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, JsError> {
        if plaintext.is_empty() || plaintext.len() > 65536 {
            return Err(error());
        }
        self.group
            .as_mut()
            .ok_or_else(error)?
            .create_message(&self.provider, &self.signer, plaintext)
            .map_err(|_| error())?
            .tls_serialize_detached()
            .map_err(|_| error())
    }
    pub fn process(&mut self, bytes: &[u8], merge: bool) -> Result<Vec<u8>, JsError> {
        let mut input = bytes;
        let message = MlsMessageIn::tls_deserialize(&mut input).map_err(|_| error())?;
        if !input.is_empty() {
            return Err(error());
        }
        let protocol = message.try_into_protocol_message().map_err(|_| error())?;
        let group = self.group.as_mut().ok_or_else(error)?;
        let processed = group
            .process_message(&self.provider, protocol)
            .map_err(|_| error())?;
        match processed.into_content() {
            ProcessedMessageContent::ApplicationMessage(message) => Ok(message.into_bytes()),
            ProcessedMessageContent::StagedCommitMessage(commit) => {
                if merge {
                    group
                        .merge_staged_commit(&self.provider, *commit)
                        .map_err(|_| error())?;
                }
                Ok(Vec::new())
            }
            _ => Err(error()),
        }
    }
    pub fn remove(&mut self, index: u32) -> Result<Vec<u8>, JsError> {
        let (commit, _, _) = self
            .group
            .as_mut()
            .ok_or_else(error)?
            .remove_members(&self.provider, &self.signer, &[LeafNodeIndex::new(index)])
            .map_err(|_| error())?;
        commit.tls_serialize_detached().map_err(|_| error())
    }
    pub fn epoch(&self) -> Result<u64, JsError> {
        Ok(self.group.as_ref().ok_or_else(error)?.epoch().as_u64())
    }
}
#[wasm_bindgen]
pub struct AddResult {
    commit: Vec<u8>,
    welcome: Vec<u8>,
}
#[wasm_bindgen]
impl AddResult {
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }
    pub fn welcome(&self) -> Vec<u8> {
        self.welcome.clone()
    }
}
