#![cfg(windows)]
//! Commitments. Mirrors frameRoot, merkleRoot and merklePath in sceneModel.js.
use sha2::{Digest, Sha256};

pub type Hash = [u8; 32];

pub fn frame_root(tile_hashes_le: &[u8]) -> Hash {
    Sha256::digest(tile_hashes_le).into()
}

fn pair(a: &Hash, b: &Hash) -> Hash {
    let mut h = Sha256::new();
    h.update(a);
    h.update(b);
    h.finalize().into()
}

fn levels(leaves: &[Hash]) -> Vec<Vec<Hash>> {
    let mut out = vec![leaves.to_vec()];
    while out.last().unwrap().len() > 1 {
        let cur = out.last().unwrap();
        let next = cur.chunks(2).map(|c| if c.len() == 2 { pair(&c[0], &c[1]) } else { c[0] }).collect();
        out.push(next);
    }
    out
}

pub fn merkle_root(leaves: &[Hash]) -> Hash {
    if leaves.is_empty() { return [0; 32]; }
    levels(leaves).last().unwrap()[0]
}

/// Siblings from a leaf to the root as (sibling is on the left, hash). A promoted node has none on that level.
pub fn merkle_path(leaves: &[Hash], index: usize) -> Vec<(bool, Hash)> {
    let mut path = vec![];
    let mut i = index;
    let all = levels(leaves);
    for level in &all[..all.len() - 1] {
        let sib = i ^ 1;
        if sib < level.len() { path.push((sib < i, level[sib])); }
        i >>= 1;
    }
    path
}

pub fn hex(h: &Hash) -> String {
    h.iter().map(|b| format!("{b:02x}")).collect()
}
