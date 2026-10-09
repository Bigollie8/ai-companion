use ai_companion::{
    aggregate, csv,
    data::{Metadata, Reader, Sources},
    parser,
};
use serde_json::{json, Value};
use std::io::{self, Read};
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let cases: Vec<Value> = serde_json::from_str(&input).unwrap();
    let results:Vec<Value>=cases.iter().map(|case| {
        let now=case["now"].as_i64().unwrap_or(0);
        match case["op"].as_str().unwrap() {
            "attention"=>json!(parser::attention(case["records"].as_array().unwrap(),case["provider"].as_str().unwrap())),
            "parse"=>{
                let (session,limits)=if case["provider"]=="codex" {parser::codex(case["text"].as_str().unwrap(),"fixture")} else {parser::claude(case["text"].as_str().unwrap(),"fixture")};
                let data=aggregate::snapshot(&session.into_iter().collect::<Vec<_>>(),&Metadata::new(),now);
                json!({"data":data,"limits":limits,"csv":csv::export(&data,0.,f64::MAX,&case["hidden"].as_array().unwrap().iter().map(|s|s.as_str().unwrap().to_owned()).collect::<Vec<_>>(),"all")})
            },
            "scan"=> {
                let sources=Sources{home:case["home"].as_str().unwrap().into(),codex:case["codex"].as_str().unwrap().into()};
                aggregate::all(&mut Reader::default(),&sources)
            },
            _=>panic!("unknown operation")
        }
    }).collect();
    println!("{}", serde_json::to_string(&results).unwrap());
}
