#!/bin/bash

set -eu

# Enable debugging output
#set -x

# Script metadata
readonly SCRIPT_VERSION="0.0.1"
readonly SCRIPT_NAME="imh-ai-assistant"
readonly BASE_URL="https://raw.githubusercontent.com/gemini2463/$SCRIPT_NAME/master"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly BRIGHTBLUE='\033[1;34m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to handle errors
error_exit() {
    print_message "$RED" "ERROR: $1" >&2
    cleanup
    exit 1
}

cleanup() {
    # Only try to clean up if TEMP_DIR is set, non-empty, and is a directory
    if [[ -n "${TEMP_DIR:-}" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

# Set up trap to ensure cleanup on exit
trap cleanup EXIT INT TERM

# Function to detect control panel
detect_control_panel() {
    if [[ (-d /usr/local/cpanel || -d /var/cpanel || -d /etc/cpanel) &&
        (-f /usr/local/cpanel/cpanel || -f /usr/local/cpanel/version) ]]; then
        echo "cpanel"
    elif [[ -d /usr/local/cwpsrv ]]; then
        echo "cwp"
    else
        echo "none"
    fi
}

if [[ "${1:-}" == "--uninstall" ]]; then
    uninstall_main() {
        echo -e "\033[0;31mUninstalling $SCRIPT_NAME...\033[0m"
        echo ""

        # Detect control panel type
        local panel=$(detect_control_panel)

        case "$panel" in
        "cpanel")
            echo "Removing cPanel plugin files..."
            rm -rf "/usr/local/cpanel/whostmgr/docroot/cgi/$SCRIPT_NAME"
            rm -f "/usr/local/cpanel/whostmgr/docroot/addon_plugins/$SCRIPT_NAME.png"
            # rm -f "/var/cpanel/apps/$SCRIPT_NAME.conf"
            if [[ -x "/usr/local/cpanel/bin/unregister_appconfig" ]]; then
                /usr/local/cpanel/bin/unregister_appconfig "$SCRIPT_NAME" || true
            fi
            ;;
        "cwp")
            echo "Removing CWP plugin files..."
            rm -f "/usr/local/cwpsrv/htdocs/resources/admin/modules/$SCRIPT_NAME.php"
            rm -f "/usr/local/cwpsrv/htdocs/admin/design/img/$SCRIPT_NAME.png"
            rm -f "/usr/local/cwpsrv/htdocs/admin/design/js/$SCRIPT_NAME.js"
            # rm -f "/usr/local/cwpsrv/htdocs/resources/admin/include/imh-plugins.php"
            # Optional: remove line from 3rdparty.php
            # sed -i "/imh-plugins.php/d" "/usr/local/cwpsrv/htdocs/resources/admin/include/3rdparty.php" || true
            ;;
        *)
            echo "Removing plain install files..."
            rm -rf "/root/$SCRIPT_NAME"
            ;;
        esac

        echo ""
        echo -e "\033[0;32mUninstall complete.\033[0m"
        exit 0
    }

    uninstall_main
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to validate URL is accessible
validate_url() {
    local url=$1
    if ! wget --spider -q "$url" 2>/dev/null; then
        error_exit "Cannot access URL: $url"
    fi
}

# Function to download file with validation
download_file() {
    local url=$1
    local destination=$2

    if [[ -d "$destination" ]]; then
        print_message "$RED" "Destination is a directory, not a file: $destination"
        return 1
    fi

    # Get the final HTTP code after redirects
    local http_code
    http_code=$(wget --server-response --spider "$url" 2>&1 | awk '/^  HTTP|^HTTP/{code=$2} END{print code}')
    #print_message "$YELLOW" "HTTP status code for $url: $http_code"

    if [[ -z "$http_code" ]]; then
        print_message "$RED" "Could not get HTTP code for $url"
        return 1
    fi
    if [[ "$http_code" != "200" ]]; then
        print_message "$RED" "File not found or inaccessible (HTTP $http_code): $url"
        return 1
    fi

    if wget -q -O "$destination" "$url"; then
        if [[ -s "$destination" ]]; then
            print_message "$GREEN" "Downloaded $url to $destination"
            return 0
        fi
        rm -f "$destination"
        print_message "$RED" "Downloaded file is empty: $url"
        return 1
    else
        print_message "$RED" "Download failed for $url (HTTP $http_code)"
        return 1
    fi
}

download_file_with_checksum() {
    local url="$1"
    local destination="$2"

    # Download the actual file
    download_file "$url" "$destination" || return 1

    # Download the checksum file (to match destination)
    download_file "${url}.sha256" "${destination}.sha256" || return 1

    # Adjust the filename in the checksum file, if necessary
    local expected_name=$(basename "$url")
    local dest_name=$(basename "$destination")
    if [[ "$expected_name" != "$dest_name" ]]; then
        sed -i "s/^\([a-fA-F0-9]*[[:space:]]\+\).*\$/\1$dest_name/" "${destination}.sha256"
    fi

    # Verify the checksum
    (
        cd "$(dirname "$destination")"
        if ! sha256sum -c "$(basename "$destination").sha256" --status; then
            print_message "$RED" "Checksum verification FAILED for $(basename "$destination")"
            rm -f "$destination"
            exit 1
        fi
    )
    print_message "$YELLOW" "Checksum verified for $(basename "$destination")"
    echo ""
    return 0
}

copy_if_changed() {
    local src="$1"
    local dest="$2"
    if [[ -f "$dest" ]]; then
        if cmp -s "$src" "$dest"; then
            print_message "$GREEN" "No change for $dest"
            return
        else
            # Optionally backup old version
            #cp -p "$dest" "${dest}.bak.$(date +%Y%m%d_%H%M%S)"
            # print_message "$YELLOW" "Backing up and replacing $dest"
            print_message "$YELLOW" "Replacing $dest"
        fi
    fi
    cp -p "$src" "$dest"
}

# Function to create directory with proper permissions
create_directory() {
    local dir=$1
    local perms=${2:-755}

    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir" || error_exit "Failed to create directory: $dir"
        chmod "$perms" "$dir" || error_exit "Failed to set permissions on: $dir"
        print_message "$GREEN" "Created directory: $dir"
    fi
}

# Function to install for cPanel
install_cpanel() {
    print_message "$YELLOW" "Installing for cPanel (end-user)..."
    echo ""

    local APPDIR="/usr/local/cpanel/base/3rdparty/$SCRIPT_NAME"
    local APPCONF_SRC="$APPDIR/$SCRIPT_NAME.conf"
    local REPO_SUBDIR="cpanel-plugin"
    local AJAX_FILE="ajax_${SCRIPT_NAME}.live.php"

    create_directory "/var/cpanel/apps"
    create_directory "$APPDIR"

    TEMP_DIR=$(mktemp -d) || error_exit "Failed to create temporary directory"

    print_message "$BRIGHTBLUE" "Downloading files..."
    echo ""

    download_file "$BASE_URL/$REPO_SUBDIR/index.live.php" "$TEMP_DIR/index.live.php" \
        || error_exit "Failed to get index.live.php"

    download_file "$BASE_URL/$REPO_SUBDIR/$AJAX_FILE" "$TEMP_DIR/$AJAX_FILE" \
        || error_exit "Failed to get $AJAX_FILE"

    download_file "$BASE_URL/$REPO_SUBDIR/$SCRIPT_NAME.conf" "$TEMP_DIR/$SCRIPT_NAME.conf" \
        || error_exit "Failed to get $SCRIPT_NAME.conf"

    download_file "$BASE_URL/$REPO_SUBDIR/$SCRIPT_NAME.js" "$TEMP_DIR/$SCRIPT_NAME.js" \
        || error_exit "Failed to get $SCRIPT_NAME.js"

    download_file "$BASE_URL/$REPO_SUBDIR/$SCRIPT_NAME.css" "$TEMP_DIR/$SCRIPT_NAME.css" \
        || error_exit "Failed to get $SCRIPT_NAME.css"

    download_file "$BASE_URL/$REPO_SUBDIR/$SCRIPT_NAME.png" "$TEMP_DIR/$SCRIPT_NAME.png" \
        || error_exit "Failed to get $SCRIPT_NAME.png"


    print_message "$BRIGHTBLUE" "Installing files..."
    echo ""

    copy_if_changed "$TEMP_DIR/index.live.php" "$APPDIR/index.live.php" \
        || error_exit "Failed to copy index.live.php"

    copy_if_changed "$TEMP_DIR/$AJAX_FILE" "$APPDIR/$AJAX_FILE" \
        || error_exit "Failed to copy $AJAX_FILE"

    copy_if_changed "$TEMP_DIR/$SCRIPT_NAME.conf" "$APPDIR/$SCRIPT_NAME.conf" \
        || error_exit "Failed to copy $SCRIPT_NAME.conf"

    copy_if_changed "$TEMP_DIR/$SCRIPT_NAME.js" "$APPDIR/$SCRIPT_NAME.js" \
        || error_exit "Failed to copy $SCRIPT_NAME.js"

    copy_if_changed "$TEMP_DIR/$SCRIPT_NAME.css" "$APPDIR/$SCRIPT_NAME.css" \
        || error_exit "Failed to copy $SCRIPT_NAME.css"

    copy_if_changed "$TEMP_DIR/$SCRIPT_NAME.png" "$APPDIR/$SCRIPT_NAME.png" \
        || error_exit "Failed to copy $SCRIPT_NAME.png"

    # perms
    chmod 0755 "$APPDIR/index.live.php" "$APPDIR/$AJAX_FILE" 2>/dev/null || true
    chmod 0644 "$APPDIR/$SCRIPT_NAME.conf" "$APPDIR/$SCRIPT_NAME.js" "$APPDIR/$SCRIPT_NAME.css" "$APPDIR/$SCRIPT_NAME.png" 2>/dev/null || true

    chown -R root:wheel "$APPDIR" 2>/dev/null || chown -R root:root "$APPDIR" || true

    print_message "$BRIGHTBLUE" "Registering plugin..."
    echo ""

    if [[ ! -x "/usr/local/cpanel/bin/register_appconfig" ]]; then
        error_exit "register_appconfig not found"
    fi

    # Re-register to apply updates cleanly
    /usr/local/cpanel/bin/unregister_appconfig "$SCRIPT_NAME" >/dev/null 2>&1 || true
    /usr/local/cpanel/bin/register_appconfig "$APPCONF_SRC" \
        || error_exit "Failed to register appconfig ($APPCONF_SRC)"
}

# Function to install for CWP
install_cwp() {
    print_message "$YELLOW" "Installing for CWP..."
    echo ""

    # Verify CWP directories exist
    [[ -d "/usr/local/cwpsrv/htdocs/resources/admin/modules" ]] || error_exit "CWP modules directory not found"

    # Create temporary directory for downloads
    TEMP_DIR=$(mktemp -d) || error_exit "Failed to create temporary directory"

    # Download files to temporary directory first

    print_message "$BRIGHTBLUE" "Downloading files..."
    echo ""

    # Remove immutable attributes if they exist
    print_message "$BRIGHTBLUE" "Preparing directories..."
    if command_exists chattr; then
        chattr -ifR /usr/local/cwpsrv/htdocs/admin 2>/dev/null || true
    fi
    echo ""

    print_message "$BRIGHTBLUE" "Installing files..."
    for path in "${FILES[@]}"; do
        src="$TEMP_DIR/$path"
        dest="/usr/local/cwpsrv/htdocs/resources/admin/modules/$SCRIPT_NAME/$path"
        mkdir -p "$(dirname "$dest")"
        copy_if_changed "$src" "$dest" || print_message "$YELLOW" "Warning: failed to copy $path"
        chmod 644 "$dest" 2>/dev/null || true
    done

    echo ""

    download_file "$BASE_URL/index.php" "$TEMP_DIR/index.php" || error_exit "Failed to get script file"
    download_file "$BASE_URL/$SCRIPT_NAME.png" "$TEMP_DIR/$SCRIPT_NAME.png" || error_exit "Failed to get PNG file"
    download_file "$BASE_URL/$SCRIPT_NAME.js" "$TEMP_DIR/$SCRIPT_NAME.js" || error_exit "Failed to get JS file"
    download_file "$BASE_URL/$SCRIPT_NAME.css" "$TEMP_DIR/$SCRIPT_NAME.css" || error_exit "Failed to get CSS file"
    download_file "$BASE_URL/ajax_$SCRIPT_NAME.php" "$TEMP_DIR/ajax_$SCRIPT_NAME.php" || error_exit "Failed to get AJAX script file"

    # Create directories if they don't exist

    create_directory "/usr/local/cwpsrv/htdocs/admin/design/img"
    create_directory "/usr/local/cwpsrv/htdocs/admin/design/css"
    create_directory "/usr/local/cwpsrv/htdocs/admin/design/js"
    create_directory "/usr/local/cwpsrv/htdocs/resources/admin/include"
    create_directory "/usr/local/cwpsrv/htdocs/resources/admin/addons/ajax"

    cp /usr/local/cwpsrv/htdocs/admin/admin/index.php mv /usr/local/cwpsrv/htdocs/admin/admin/index.php-bak-$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
    mv /usr/local/cwpsrv/htdocs/admin/admin/index.php /usr/local/cwpsrv/htdocs/admin/admin/index2.php 2>/dev/null || true

    # Move additional files
    copy_if_changed "$TEMP_DIR/index.php" "/usr/local/cwpsrv/htdocs/admin/admin/index.php" || print_message "$YELLOW" "Warning: Failed to copy PHP file"

    copy_if_changed "$TEMP_DIR/$SCRIPT_NAME.png" "/usr/local/cwpsrv/htdocs/admin/admin/$SCRIPT_NAME.png" || print_message "$YELLOW" "Warning: Failed to copy image"

    copy_if_changed "$TEMP_DIR/$SCRIPT_NAME.js" "/usr/local/cwpsrv/htdocs/admin/design/js/$SCRIPT_NAME.js" || print_message "$YELLOW" "Warning: Failed to copy $SCRIPT_NAME.js"

    copy_if_changed "$TEMP_DIR/$SCRIPT_NAME.css" "/usr/local/cwpsrv/htdocs/admin/design/css/$SCRIPT_NAME.css" || print_message "$YELLOW" "Warning: Failed to copy $SCRIPT_NAME.css"

    copy_if_changed "$TEMP_DIR/ajax_$SCRIPT_NAME.php" "/usr/local/cwpsrv/htdocs/resources/admin/addons/ajax/ajax_$SCRIPT_NAME.php" || print_message "$YELLOW" "Warning: Failed to copy AJAX script"
}

# Main installation function
main() {
    print_message "$RED" "Installing $SCRIPT_NAME plugin v$SCRIPT_VERSION..."
    echo ""

    # Check prerequisites
    check_root

    # Check for required commands
    for cmd in wget mktemp; do
        if ! command_exists "$cmd"; then
            error_exit "Required command not found: $cmd"
        fi
    done

    # Validate base URL is accessible
    validate_url "$BASE_URL/index.php"

    # Detect control panel
    local panel=$(detect_control_panel)

    case "$panel" in
    "cpanel")
        install_cpanel
        ;;
    "cwp")
        install_cwp
        ;;
    esac

    echo ""
    print_message "$BLUE" "Installation complete!"
}

# Run main function
main "$@"
