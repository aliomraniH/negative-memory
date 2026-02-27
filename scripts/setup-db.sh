#!/bin/bash
# ============================================================================
# Negative Example Memory — Database Setup Script
# One-command database setup: create DB, enable extensions, run migrations, seed
# ============================================================================

set -e

echo "=== Negative Example Memory — Database Setup ==="

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

DB_NAME="${PGDATABASE:-negative_memory}"
DB_USER="${PGUSER:-user}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"

echo ""
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Step 1: Create database if it doesn't exist
echo "[1/4] Checking/creating database..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME"
echo "  Database '$DB_NAME' ready."

# Step 2: Enable extensions
echo "[2/4] Enabling extensions..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
    CREATE EXTENSION IF NOT EXISTS \"vector\";
    CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";
"
echo "  Extensions enabled."

# Step 3: Run schema migrations
echo "[3/4] Running schema migrations..."
npm run setup-db
echo "  Migrations complete."

# Step 4: Load seed data
echo "[4/4] Loading seed data..."
npm run seed
echo "  Seed data loaded."

echo ""
echo "=== Setup Complete ==="
echo "You can now start the server with: npm start"
