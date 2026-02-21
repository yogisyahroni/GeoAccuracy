// Removed node-fetch require to use global fetch
const API_BASE = 'http://localhost:8081/api';

async function runTests() {
    console.log("=== Starting Data Integration API Tests ===");

    // 1. Register a fresh user or Login
    let token = '';
    const email = `testuser_${Date.now()}@example.com`;
    try {
        await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password123', name: 'Test User', company_name: "Testing Co" })
        });

        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const loginBody = await loginRes.text();
        const match = loginBody.match(/"token"\s*:\s*"([^"]+)"/);
        token = match ? match[1] : null;

        if (!token) throw new Error("Could not get token: " + loginBody);
        console.log("✅ Authenticated successfully");
    } catch (e) {
        console.error("❌ Authentication failed:", e.message);
        process.exit(1);
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 2. Create DataSource
    let dsId;
    try {
        const dsRes = await fetch(`${API_BASE}/datasources`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: "Test PostgreSQL DB",
                provider: "postgresql",
                host: "localhost",
                port: 5432,
                database: "geodata",
                username: "postgres",
                password: "1234"
            })
        });
        const dsData = await dsRes.json();
        dsId = dsData.data?.id || dsData.id;

        if (!dsId) {
            const listDsRes = await fetch(`${API_BASE}/datasources`, { headers });
            const listDsData = await listDsRes.json();
            dsId = (listDsData.data && listDsData.data[0]?.id) || (listDsData[0]?.id);
        }

        if (!dsId) throw new Error("No data source found or created: " + JSON.stringify(dsData));
        console.log("✅ Data Source Ready (ID: " + dsId + ")");
    } catch (e) {
        console.error("❌ DataSource creation failed:", e.message);
        process.exit(1);
    }

    // 3. Create Pipeline
    let pipelineId;
    try {
        const pRes = await fetch(`${API_BASE}/datasources/${dsId}/pipelines`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: "My Automated ETL Pipeline",
                config: {
                    base_table: "users",
                    mappings: [{ target_column: "address", expression: "address" }],
                    joins: [],
                    filters: []
                }
            })
        });
        const pData = await pRes.json();
        pipelineId = pData.data?.id || pData.id;
        if (!pipelineId) throw new Error("Pipeline creation failed: " + JSON.stringify(pData));
        console.log("✅ Pipeline created successfully (ID: " + pipelineId + ")");
    } catch (e) {
        console.error("❌ Pipeline Creation failed:", e.message);
        process.exit(1);
    }

    // 4. List Pipelines
    try {
        const listRes = await fetch(`${API_BASE}/datasources/${dsId}/pipelines`, { headers });
        const listData = await listRes.json();
        const pipelines = listData.data || listData;
        const exists = pipelines.find(p => p.id === pipelineId);
        if (!exists) throw new Error("Pipeline not found in list");
        console.log("✅ Pipeline listing works correctly.");
    } catch (e) {
        console.error("❌ Pipeline Listing failed:", e.message);
        process.exit(1);
    }

    // 5. Delete Pipeline
    try {
        const delRes = await fetch(`${API_BASE}/datasources/${dsId}/pipelines/${pipelineId}`, {
            method: 'DELETE',
            headers
        });
        if (!delRes.ok) throw new Error("Delete request failed with status: " + delRes.status);
        console.log("✅ Pipeline deleted successfully.");
    } catch (e) {
        console.error("❌ Pipeline Deletion failed:", e.message);
        process.exit(1);
    }

    console.log("=========================================");
    console.log("🚀 ALL PIPELINE END-TO-END TESTS PASSED!");
    console.log("=========================================");
}

runTests();
