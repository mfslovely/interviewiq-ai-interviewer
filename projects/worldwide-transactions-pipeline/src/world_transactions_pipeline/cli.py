import argparse
import json
from pathlib import Path

from .generator import generate_transactions
from .pipeline import run_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Synthetic worldwide transaction ETL pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate = subparsers.add_parser("generate", help="Generate deterministic synthetic CSV data")
    generate.add_argument("--output", type=Path, default=Path("data/raw/world_transactions.csv"))
    generate.add_argument("--count", type=int, default=1000)
    generate.add_argument("--seed", type=int, default=42)

    run = subparsers.add_parser("run", help="Validate, transform, enrich and load a CSV")
    run.add_argument("--input", type=Path, default=Path("data/raw/world_transactions.csv"))
    run.add_argument("--output-dir", type=Path, default=Path("output"))

    demo = subparsers.add_parser("demo", help="Generate data and run the whole pipeline")
    demo.add_argument("--count", type=int, default=1000)
    demo.add_argument("--seed", type=int, default=42)
    demo.add_argument("--data-dir", type=Path, default=Path("data/raw"))
    demo.add_argument("--output-dir", type=Path, default=Path("output"))
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "generate":
        print(generate_transactions(args.output, args.count, args.seed))
        return
    if args.command == "demo":
        source = generate_transactions(args.data_dir / "world_transactions.csv", args.count, args.seed)
        summary = run_pipeline(source, args.output_dir)
    else:
        summary = run_pipeline(args.input, args.output_dir)
    print(json.dumps(summary, indent=2))
