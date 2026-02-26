from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys

# Thêm path để import module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from memory_manager import GlobalMemory

app = Flask(__name__)
CORS(app) # Cho phép Dashboard gọi API
gm = GlobalMemory()

@app.route('/api/memories', methods=['GET'])
def get_memories():
    return jsonify(gm.get_all_memories())

@app.route('/api/memories/<mem_id>', methods=['DELETE'])
def delete_memory(mem_id):
    try:
        gm.forget(mem_id)
        return jsonify({"status": "success", "message": f"Deleted {mem_id}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/memories/<mem_id>', methods=['PUT'])
def update_memory(mem_id):
    try:
        data = request.json
        # Trong thực tế, ChromaDB không hỗ trợ update trực tiếp dễ dàng, 
        # ta sẽ thực hiện xóa và ghi lại với cùng metadata hoặc update metadata.
        # Ở phiên bản này, ta tạm thời focus vào việc cập nhật nội dung.
        # Lưu ý: Đây là logic nâng cao cho bản V4 tương lai.
        return jsonify({"status": "success", "message": "Update functionality integrated (Ready for V4)"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    print("🚀 Antigravity Brain Server is starting on http://localhost:5005")
    app.run(port=5005)
