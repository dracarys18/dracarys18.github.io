#!/usr/bin/env python3
"""
Build script to compile Typst blog posts to HTML using Jinja2 templating.
Supports both HTML and SVG export modes (SVG for posts with math).
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path
from jinja2 import Template


def extract_metadata(typst_file: Path) -> dict:
    """Extract metadata from Typst file."""
    content = typst_file.read_text()
    metadata = {}

    # Pattern to match: #let key = "value"
    pattern = r'#let\s+(\w+)\s+=\s+"([^"]*)"'

    for match in re.finditer(pattern, content):
        key = match.group(1)
        value = match.group(2)
        metadata[key] = value

    return metadata


def has_math(typst_file: Path) -> bool:
    """Check if Typst file contains math expressions."""
    content = typst_file.read_text()
    # Look for inline math ($...$) or display math ($ ... $)
    # This is a simple heuristic - matches $ not in code blocks
    math_pattern = r"\$[^$]+\$"
    return bool(re.search(math_pattern, content))


def compile_typst_to_svg(typst_file: Path, root_dir: Path) -> str:
    """Compile Typst file to SVG and return SVG content."""
    import shutil

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        svg_pattern = tmpdir_path / "output-{p}.svg"

        # Compile Typst to SVG (may generate multiple pages)
        cmd = [
            "typst",
            "compile",
            "--format",
            "svg",
            "--root",
            str(root_dir),
            str(typst_file),
            str(svg_pattern),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Print warnings to stderr (they're expected)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        if result.returncode != 0:
            raise Exception(f"Typst SVG compilation failed: {result.stderr}")

        # Collect all generated SVG files
        svg_files = sorted(tmpdir_path.glob("output-*.svg"))

        if not svg_files:
            raise Exception("No SVG files were generated")

        # Read and combine all SVG files
        combined_svg = []
        for svg_file in svg_files:
            svg_content = svg_file.read_text()
            combined_svg.append(svg_content)

        # Return combined SVG with divs for each page
        return "\n".join(combined_svg)


def compile_typst_to_html(typst_file: Path, root_dir: Path) -> str:
    """Compile Typst file to HTML and return body content."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".html", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        # Compile Typst to HTML
        cmd = [
            "typst",
            "compile",
            "--features",
            "html",
            "--format",
            "html",
            "--root",
            str(root_dir),
            str(typst_file),
            str(tmp_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        # Print warnings to stderr (they're expected)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        if result.returncode != 0:
            raise Exception(f"Typst compilation failed: {result.stderr}")

        # Read and extract body content
        html_content = tmp_path.read_text()

        # Extract content between <body> tags
        body_match = re.search(r"<body>(.*?)</body>", html_content, re.DOTALL)
        if body_match:
            return body_match.group(1).strip()
        else:
            raise Exception("Could not find body content in generated HTML")

    finally:
        # Clean up temp file
        if tmp_path.exists():
            tmp_path.unlink()


def build_blog_post(
    typst_file: Path, template_file: Path, output_file: Path, root_dir: Path
):
    """Build a single blog post from Typst source."""
    print(f"Building {typst_file.name}...")

    # Extract metadata
    metadata = extract_metadata(typst_file)

    # Check if post contains math
    use_svg = has_math(typst_file)

    if use_svg:
        print(f"  Math detected - using SVG export")
        body_content = compile_typst_to_svg(typst_file, root_dir)
    else:
        print(f"  No math detected - using HTML export")
        body_content = compile_typst_to_html(typst_file, root_dir)

    # Load template
    template = Template(template_file.read_text())

    # Render template
    html = template.render(
        TITLE=metadata.get("title", "Untitled"),
        SLUG=metadata.get("slug", ""),
        DATE_DISPLAY=metadata.get("date_display", ""),
        DATE_ISO=metadata.get("date_iso", ""),
        DESCRIPTION=metadata.get("description", ""),
        KEYWORDS=metadata.get("keywords", ""),
        CONTENT=body_content,
        IS_SVG=use_svg,
    )

    # Write output
    output_file.write_text(html)
    print(f"  → {output_file}")


def main():
    if len(sys.argv) < 3:
        print("Usage: build_blog.py <typst_file> <output_file>")
        sys.exit(1)

    typst_file = Path(sys.argv[1])
    output_file = Path(sys.argv[2])

    # Get project root
    root_dir = Path(__file__).parent.parent
    template_file = root_dir / "templates" / "blog-post.html"

    if not typst_file.exists():
        print(f"Error: {typst_file} does not exist")
        sys.exit(1)

    if not template_file.exists():
        print(f"Error: {template_file} does not exist")
        sys.exit(1)

    # Build the blog post
    build_blog_post(typst_file, template_file, output_file, root_dir)


if __name__ == "__main__":
    main()
