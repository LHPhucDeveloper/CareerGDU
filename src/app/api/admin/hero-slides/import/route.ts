import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

const defaultSlides = [
    {
        title: "Tìm việc làm phù hợp cho sinh viên GDU",
        subtitle: "Kết nối sinh viên với hàng ngàn cơ hội việc làm từ các doanh nghiệp uy tín",
        image: "/students-working-together-university.jpg",
        cta: "Khám phá ngay",
        link: "/jobs",
        page: "home",
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        title: "Thực tập sinh - Bước đệm sự nghiệp",
        subtitle: "Hơn 500+ vị trí thực tập tại các công ty hàng đầu đang chờ bạn",
        image: "/internship-program-students-learning.jpg",
        cta: "Xem vị trí thực tập",
        link: "/internships",
        page: "home",
        order: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        title: "Hội chợ việc làm GDU 2025",
        subtitle: "Sự kiện kết nối sinh viên với 100+ doanh nghiệp - Đăng ký ngay!",
        image: "/job-fair-event-with-students-and-employers.jpg",
        cta: "Đăng ký tham gia",
        link: "/contact",
        page: "home",
        order: 2,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
    },
]

export async function POST() {
    try {
        const collection = await getCollection(COLLECTIONS.HERO_SLIDES)

        // Check if any slides already exist to avoid accidental duplicates 
        // though the user might want this to reset, let's just insert them
        const result = await collection.insertMany(defaultSlides)

        return NextResponse.json({
            success: true,
            message: `Đã nhập ${result.insertedCount} slide mặc định thành công`,
        })
    } catch (error) {
        console.error("Error importing default slides:", error)
        return NextResponse.json({ success: false, error: "Lỗi nhập dữ liệu mặc định" }, { status: 500 })
    }
}
