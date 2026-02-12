#!/bin/bash


# Load .env file if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Configuration
domains=(${1:-$DOMAINS}) # Get from arg 1 or .env
email=${2:-$EMAIL}       # Get from arg 2 or .env
rsa_key_size=4096
data_path="./certbot"
staging=0 # Set to 1 if you're testing your setup to avoid hitting request limits

# Validation
if [ -z "$domains" ]; then
  echo "Error: No domains specified. Usage: ./setup-ssl.sh <domain> <email>"
  echo "Or set DOMAINS and EMAIL in .env file"
  exit 1
fi

if [ -z "$email" ]; then
  echo "Error: No email specified. Usage: ./setup-ssl.sh <domain> <email>"
  echo "Or set DOMAINS and EMAIL in .env file"
  exit 1
fi


if [ -d "$data_path" ]; then
  read -p "Existing data found for $domains. Continue and replace existing certificate? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi


if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
  echo "### Downloading recommended TLS parameters ..."
  mkdir -p "$data_path/conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
fi


echo "### Initializing HTTP configuration ..."
cp ./nginx/conf.d/app.conf.template.http ./nginx/conf.d/app.conf
echo

echo "### Starting nginx ..."
docker compose up --force-recreate -d nginx
echo

echo "### Requesting Let's Encrypt certificate for $domains ..."
#Join $domains to -d args
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="--email $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot
echo

echo "### Switching to SSL configuration ..."
cp ./nginx/conf.d/app.conf.template.https ./nginx/conf.d/app.conf

echo "### Reloading nginx again with SSL config ..."
docker compose exec nginx nginx -s reload


echo "### Starting certbot for auto-renewal ..."
docker compose up -d certbot

echo "### Done! SSL setup is complete and auto-renewal is active."
