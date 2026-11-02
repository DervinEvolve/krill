//! The security.txt embedded in the program bytes (see `lib.rs`) must survive
//! the build and say what SECURITY.md says: where the source is and how to
//! report a vulnerability.

use solana_security_txt::{find_and_parse, Contact};

const REPO: &str = "https://github.com/DervinEvolve/krill";

#[test]
fn program_bytes_carry_a_security_txt_pointing_at_the_repo() {
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/krill.so"));
    let txt = find_and_parse(bytes).expect("the built program embeds a parseable security.txt");

    assert_eq!(txt.name, "Krill");
    assert_eq!(txt.project_url, REPO);
    assert_eq!(txt.policy, format!("{REPO}/blob/main/SECURITY.md"));
    assert_eq!(txt.source_code.as_deref(), Some(REPO));
    assert_eq!(txt.preferred_languages, vec!["en".to_string()]);
    let links: Vec<String> = txt
        .contacts
        .iter()
        .map(|contact| match contact {
            Contact::Link(link) => link.clone(),
            _ => "not a link".to_string(),
        })
        .collect();
    assert_eq!(
        links,
        vec![format!("{REPO}/security/advisories/new")],
        "the one contact is the repo's private advisory form"
    );
}
