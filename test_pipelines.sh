#!/bin/bash
set -e

echo "Testing Pipeline CRUD Endpoints..."

# 1. Login to get token
echo "Logging in as admin..."
LOGIN_RESP=$(curl -s -X POST http://localhost:8081/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@geoverify.id","password":"admin"}')
# Extract token - very basic extraction assuming "token":"xyz"
TOKEN=$(echo $LOGIN_RESP | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "Failed to get token! Response: $LOGIN_RESP"
    # fallback to creating a user
    curl -s -X POST http://localhost:8081/api/auth/register -H "Content-Type: application/json" -d '{"email":"admin2@test.com","password":"password123","name":"Admin 2","company_name":"Test Inc"}' > /dev/null
    LOGIN_RESP=$(curl -s -X POST http://localhost:8081/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin2@test.com","password":"password123"}')
    TOKEN=$(echo $LOGIN_RESP | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    if [ -z "$TOKEN" ]; then
        echo "Still failed. $LOGIN_RESP"
        exit 1
    fi
fi
echo "Got token."

# 2. Create a test datasource
echo "Creating dummy data source..."
DS_RESP=$(curl -s -X POST http://localhost:8081/api/datasources \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Test DB",
        "provider": "postgresql",
        "host": "localhost",
        "port": 5432,
        "database": "postgres",
        "username": "postgres",
        "password": "password"
    }')
DS_ID=$(echo $DS_RESP | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2)

if [ -z "$DS_ID" ]; then
    echo "No DS ID created, trying to fetch existing..."
    DS_RESP=$(curl -s http://localhost:8081/api/datasources -H "Authorization: Bearer $TOKEN")
    DS_ID=$(echo $DS_RESP | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2)
    if [ -z "$DS_ID" ]; then
        echo "Failed to get DS ID: $DS_RESP"
        exit 1
    fi
fi
echo "Using Data Source ID: $DS_ID"

# 3. Create Pipeline
echo "Creating Pipeline..."
CREATE_RESP=$(curl -s -X POST "http://localhost:8081/api/datasources/$DS_ID/pipelines" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "Test Pipeline",
        "config": {
            "base_table": "users",
            "mappings": [{"target_column":"address","expression":"address"}]
        }
    }')
PIPELINE_ID=$(echo $CREATE_RESP | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2)

if [ -z "$PIPELINE_ID" ]; then
    echo "Failed to create pipeline: $CREATE_RESP"
    exit 1
fi
echo "Pipeline created with ID: $PIPELINE_ID"

# 4. List Pipelines
echo "Listing Pipelines..."
LIST_RESP=$(curl -s "http://localhost:8081/api/datasources/$DS_ID/pipelines" -H "Authorization: Bearer $TOKEN")
if [[ "$LIST_RESP" != *"Test Pipeline"* ]]; then
    echo "Pipeline not found in list: $LIST_RESP"
    exit 1
fi
echo "Pipeline list check passed."

# 5. Delete Pipeline
echo "Deleting Pipeline $PIPELINE_ID..."
DELETE_RESP=$(curl -s -X DELETE "http://localhost:8081/api/datasources/$DS_ID/pipelines/$PIPELINE_ID" -H "Authorization: Bearer $TOKEN")
if [[ "$DELETE_RESP" != *"deleted"* ]] && [[ "$DELETE_RESP" != *"{}"* && "$DELETE_RESP" != "" ]]; then
   # if not empty or not success
   echo "Warning on delete: $DELETE_RESP"
fi

# 6. Verify Deletion
LIST_RESP2=$(curl -s "http://localhost:8081/api/datasources/$DS_ID/pipelines" -H "Authorization: Bearer $TOKEN")
if echo "$LIST_RESP2" | grep -q "\"id\":$PIPELINE_ID"; then
    echo "Pipeline $PIPELINE_ID still exists! Deletion failed."
    exit 1
fi

echo "=================="
echo "ALL TESTS PASSED!"
echo "=================="
