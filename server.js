const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); // Cho phép mọi app/web truy cập lấy data

// Bộ não lưu trữ trung tâm
let vatsimData = {
    liveData: {}, // Chứa vị trí hiện tại của toàn bộ máy bay và ATC
    history: {}   // Chứa vệt đuôi (trail) và thời gian online cuối cùng
};

// Hàm tính khoảng cách (Hải lý)
function getDistanceNM(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchVatsim() {
    try {
        const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
        const parsed = await response.json();
        
        vatsimData.liveData = parsed; // Lưu bản đồ hiện tại
        
        const now = Date.now();
        const activeCids = new Set();

        if (parsed.pilots) {
            parsed.pilots.forEach(p => {
                const cid = p.cid.toString();
                activeCids.add(cid);

                // Khởi tạo lịch sử cho máy bay mới xuất hiện
                if (!vatsimData.history[cid]) {
                    vatsimData.history[cid] = {
                        trail: [],
                        lastSeen: now
                    };
                }

                const hist = vatsimData.history[cid];
                hist.lastSeen = now; // Cập nhật giờ online

                const newPos = { lat: p.latitude, lng: p.longitude };
                
                // Chỉ lưu tọa độ nếu bay cách điểm cũ hơn 5 NM (Chống đầy RAM)
                if (hist.trail.length === 0) {
                    hist.trail.push(newPos);
                } else {
                    const lastPos = hist.trail[hist.trail.length - 1];
                    if (getDistanceNM(lastPos.lat, lastPos.lng, newPos.lat, newPos.lng) > 5) {
                        hist.trail.push(newPos);
                        // Giữ tối đa 500 điểm cho mỗi máy bay (Đủ bay nửa vòng trái đất)
                        if (hist.trail.length > 500) hist.trail.shift();
                    }
                }
            });
        }

        // ==========================================
        // THUẬT TOÁN DỌN RÁC (XOÁ MÁY BAY OFFLINE > 30 PHÚT)
        // ==========================================
        const THIRTY_MINUTES = 30 * 60 * 1000;
        Object.keys(vatsimData.history).forEach(cid => {
            if (!activeCids.has(cid)) {
                if (now - vatsimData.history[cid].lastSeen > THIRTY_MINUTES) {
                    delete vatsimData.history[cid];
                    console.log(`[Dọn rác] Đã xoá lịch sử CID ${cid} vì ngắt kết nối quá 30p.`);
                }
            }
        });

        console.log(`[${new Date().toISOString()}] Đã cập nhật ${parsed.pilots?.length || 0} tàu bay.`);
    } catch (e) {
        console.error("Lỗi kéo data VATSIM:", e.message);
    }
}

// Chạy bot ngầm mỗi 15 giây
setInterval(fetchVatsim, 15000);
fetchVatsim();

// Mở cổng API cho App Desktop lấy data
app.get('/api/traffic', (req, res) => {
    res.json(vatsimData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend Server đang chạy ở cổng ${PORT}`);
});