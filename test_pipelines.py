import requests
import json
import uuid

API_BASE = 'http://localhost:8081/api'

def run():
    print("=== Starting Data Integration API Tests (Python) ===")
    
    email = f"pyuser_{uuid.uuid4()}@example.com"
    
    # 1. Register
    requests.post(f"{API_BASE}/auth/register", json={
        "email": email,
        "password": "password123",
        "name": "Py User",
        "company_name": "Py Co"
    })
    
    # 2. Login
    res = requests.post(f"{API_BASE}/auth/login", json={
        "email": email,
        "password": "password123"
    })
    data = res.json()
    token = data.get('access_token')
    if not token and 'data' in data:
        token = data['data'].get('access_token')
        
    if not token:
        print("❌ Auth failed:", data)
        return
    print("✅ Authenticated successfully")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Create DS
    ds_res = requests.post(f"{API_BASE}/datasources", headers=headers, json={
        "name": "Py Test DB",
        "provider": "postgresql",
        "host": "localhost",
        "port": 5432,
        "database": "postgres",
        "username": "postgres",
        "password": "password"
    })
    
    if ds_res.status_code == 200:
        ds_id = ds_res.json().get('id') or ds_res.json().get('data', {}).get('id')
    else:
        print("Failed to create DS:", ds_res.text)
        # fetch existing
        ds_list_res = requests.get(f"{API_BASE}/datasources", headers=headers)
        if ds_list_res.status_code != 200:
            print("Failed to fetch DS:", ds_list_res.text)
            return
            
        ds_list = ds_list_res.json()
        if 'data' in ds_list:
            ds_list = ds_list['data']
        ds_id = ds_list[0]['id'] if ds_list and len(ds_list) > 0 else None
        
    if not ds_id:
        print("❌ Could not get or create DataSource")
        return
        
    print(f"✅ Data Source Ready (ID: {ds_id})")
    
    # 4. Create Pipeline
    print("\n--- Creating Pipeline ---")
    p_res = requests.post(f"{API_BASE}/pipelines", headers=headers, json={
        "name": "My Automates ETL",
        "data_source_id": ds_id,
        "config": {
            "base_table": "public.orders",
            "joins": [],
            "mappings": [
                {"target_column": "full_address", "expression": "delivery_address"}
            ],
            "cron_active": True,
            "cron": "*/1 * * * *" # Every minute
        }
    })
    print("Create Pipeline Status:", p_res.status_code)
    if p_res.status_code == 200:
        p_data = p_res.json()
        p_id = p_data.get('id') or p_data.get('data', {}).get('id')
        print("Pipeline Created:", p_data)
    else:
        print("Create fail:", p_res.text)
        return
        
    print(f"✅ Pipeline created successfully (ID: {p_id})")
    
    # 5. List Pipelines
    list_res = requests.get(f"{API_BASE}/datasources/{ds_id}/pipelines", headers=headers)
    pipelines = list_res.json()
    if 'data' in pipelines:
        pipelines = pipelines['data']
        
    found = any(p.get('id') == p_id for p in pipelines)
    if not found:
        print("❌ Pipeline not found in list")
        return
    print("✅ Pipeline listing works correctly.")
    
    # 6. Delete Pipeline
    del_res = requests.delete(f"{API_BASE}/pipelines/{p_id}", headers=headers)
    if del_res.status_code != 200:
        print("❌ Pipeline Deletion failed:", del_res.text)
        return
    print("✅ Pipeline deleted successfully.")
    
    print("=========================================")
    print("🚀 ALL PIPELINE END-TO-END TESTS PASSED!")
    print("=========================================")

if __name__ == '__main__':
    run()
