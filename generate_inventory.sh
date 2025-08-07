#!/bin/bash

# ? Add host group to inventory.ini & populate it if ips for group exist
add_host_group() {
    local group_name="$1"
    local filter_value="$2"

    # Get IPs for instances matching the filter
    local ips=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=*${filter_value}*" "Name=instance-state-name,Values=running" \
        --query 'Reservations[].Instances[].PublicIpAddress' \
        --output text | tr '\t' '\n' | grep -v '^$')

    # Only add group if IPs were found
    if [[ -n "$ips" ]]; then
        echo "" >> inventory.ini
        echo "[$group_name]" >> inventory.ini
        echo "$ips" >> inventory.ini
    fi
}

# Clear existing inventory file
> inventory.ini

# Add host groups (only if instances exist)
add_host_group "Unwrapper" "Unwrapper Service"