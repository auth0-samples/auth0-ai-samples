#!/bin/bash

# Script to update arbitrary npm dependency packages to specified versions across all samples
# Usage: ./update_packages.sh <package@version> [<package@version> ...]
# Examples:
#   ./update_dependency.sh react@19.0.0
#   ./update_dependency.sh react@19.0.0 react-dom@19.0.0
#   ./update_dependency.sh @auth0/ai@^5.1.1 @auth0/ai-vercel@^4.1.0

set -e

REGISTRY="--registry https://registry.npmjs.org/"

# Check if at least one argument is provided
if [ $# -eq 0 ]; then
    echo "Error: No dependencies specified"
    echo "Usage: $0 <package@version> [<package@version> ...]"
    echo ""
    echo "Examples:"
    echo "  $0 react@19.0.0"
    echo "  $0 react@19.0.0 react-dom@19.0.0"
    echo "  $0 @auth0/ai@^5.1.1 @auth0/ai-vercel@^4.1.0"
    exit 1
fi

# Parse arguments into arrays
declare -a PACKAGE_NAMES
declare -a PACKAGE_VERSIONS

for arg in "$@"; do
    # Split on @ but handle scoped packages (e.g., @auth0/ai@^5.1.1)
    if [[ "$arg" =~ ^(@[^@]+/[^@]+)@(.+)$ ]]; then
        # Scoped package: @scope/name@version
        PACKAGE_NAMES+=("${BASH_REMATCH[1]}")
        PACKAGE_VERSIONS+=("${BASH_REMATCH[2]}")
    elif [[ "$arg" =~ ^([^@]+)@(.+)$ ]]; then
        # Regular package: name@version
        PACKAGE_NAMES+=("${BASH_REMATCH[1]}")
        PACKAGE_VERSIONS+=("${BASH_REMATCH[2]}")
    else
        echo "Error: Invalid format for '$arg'. Expected format: package@version"
        exit 1
    fi
done

echo "Starting package updates..."
echo "Will update the following packages:"
for i in "${!PACKAGE_NAMES[@]}"; do
    echo "  ${PACKAGE_NAMES[$i]} -> ${PACKAGE_VERSIONS[$i]}"
done
echo ""

# Function to update a package.json file and reinstall packages
update_package_json() {
    local file="$1"
    local updated=false

    echo "Checking $file..."

    # Check and update each package
    for i in "${!PACKAGE_NAMES[@]}"; do
        local pkg="${PACKAGE_NAMES[$i]}"
        local version="${PACKAGE_VERSIONS[$i]}"

        # Escape special characters for grep and sed
        local pkg_escaped=$(echo "$pkg" | sed 's/\//\\\//g')

        if grep -q "\"$pkg\"" "$file"; then
            echo "  Updating $pkg to $version"
            # Use different sed syntax for macOS vs Linux
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' 's/"'"$pkg_escaped"'": "[^"]*"/"'"$pkg_escaped"'": "'"$version"'"/g' "$file"
            else
                sed -i 's/"'"$pkg_escaped"'": "[^"]*"/"'"$pkg_escaped"'": "'"$version"'"/g' "$file"
            fi
            updated=true
        fi
    done

    if [ "$updated" = true ]; then
        echo "  Updated $file"
        dir=$(dirname "$file")

        # Collect packages to uninstall and reinstall
        packages_to_uninstall=""
        packages_to_reinstall=""

        for i in "${!PACKAGE_NAMES[@]}"; do
            local pkg="${PACKAGE_NAMES[$i]}"
            local version="${PACKAGE_VERSIONS[$i]}"

            if grep -q "\"$pkg\":" "$file"; then
                packages_to_uninstall="$packages_to_uninstall $pkg"
                packages_to_reinstall="$packages_to_reinstall $pkg@$version"
            fi
        done

        # Uninstall all specified packages at once
        if [ -n "$packages_to_uninstall" ]; then
            echo "    Uninstalling:$packages_to_uninstall"
            (cd "$dir" && npm uninstall$packages_to_uninstall $REGISTRY 2>/dev/null || true)
        fi

        # Reinstall all specified packages at once
        if [ -n "$packages_to_reinstall" ]; then
            echo "    Reinstalling:$packages_to_reinstall"
            (cd "$dir" && npm install$packages_to_reinstall $REGISTRY)
        fi
    fi
}

# Find all package.json files and update them
find . -name "package.json" -type f -not -path "*/node_modules/*" | while read -r file; do
    # Check if any of the specified packages exist in this package.json
    should_update=false
    for pkg in "${PACKAGE_NAMES[@]}"; do
        if grep -q "\"$pkg\"" "$file"; then
            should_update=true
            break
        fi
    done

    if [ "$should_update" = true ]; then
        update_package_json "$file"
    fi
done

echo ""
echo "Package updates completed!"
