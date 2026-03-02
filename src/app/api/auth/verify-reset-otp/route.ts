import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

export async function POST(req: Request) {
    try {
        const { email, otp } = await req.json()

        if (!email || !otp) {
            return NextResponse.json({ error: "Thiếu thông tin" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.USERS)

        // Find user with matching email, OTP and valid expiration
        const user = await collection.findOne({
            email: email,
            resetPasswordToken: otp,
            resetPasswordExpires: { $gt: new Date() }
        })

        if (!user) {
            return NextResponse.json({ error: "Mã OTP không chính xác hoặc đã hết hạn" }, { status: 400 })
        }

        return NextResponse.json({ success: true, message: "OTP hợp lệ" })

    } catch (error) {
        console.error("Verify OTP error:", error)
        return NextResponse.json({ error: "Đã xảy ra lỗi" }, { status: 500 })
    }
}
