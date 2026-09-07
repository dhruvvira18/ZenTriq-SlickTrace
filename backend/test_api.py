import os
import numpy as np
from datetime import datetime
from opendrift_service import run_hindcast_simulation

def debug_opendrift():
    print("--- INITIATING OPENDRIFT ISOLATION TEST ---\n")
    
    # 1. Hardcoded mock coordinates from the Mumbai coast
    test_lat = 18.9803
    test_lon = 72.0096
    test_time = datetime(2026, 8, 29, 10, 0)
    
    print(f"Target Time: {test_time}")
    print(f"Target Coordinates: {test_lat}, {test_lon}")
    print("Booting OpenOil physics engine...\n")
    
    try:
        # 2. Execute the engine
        result = run_hindcast_simulation(
            start_lat=test_lat, 
            start_lon=test_lon, 
            detection_time=test_time, 
            hours_back=24
        )
        
        # 3. Interrogate the Data
        path = result.get("trajectory_path", [])
        path_length = len(path)
        
        print("\n--- SIMULATION COMPLETE ---")
        print(f"Calculated Dump Time: {result.get('dump_time')}")
        print(f"Calculated Origin: {result.get('origin_latitude')}, {result.get('origin_longitude')}")
        print(f"Extracted Trajectory Points: {path_length}")
        
        # 4. Diagnostic Logic
        if path_length == 1000:
            print("\n❌ BUG CONFIRMED: THE HAIRBALL EFFECT.")
            print("The engine returned 1,000 points. The numpy array collapsed the 'time' axis instead of the 'particles' axis.")
        elif path_length in [24, 25]:
            print("\n✅ PASSED: The engine returned exact hourly centroids.")
        else:
            print(f"\n⚠️ UNEXPECTED BEHAVIOR: Returned {path_length} points.")

        print("\nFirst 3 Coordinates Output (Should be [Lat, Lon]):")
        for i in range(min(3, path_length)):
            print(f"T-{24 - i}H: {path[i]}")
            
    except Exception as e:
        print(f"\n🛑 CRITICAL ENGINE FAILURE: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_opendrift()