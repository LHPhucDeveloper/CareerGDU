import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import bcrypt from "bcryptjs"

export async function POST(req: Request) {
    try {
        const { email, otp, newPassword } = await req.json()

        if (!email || !otp || !newPassword) {
            return NextResponse.json({ error: "Thiếu thông tin" }, { status: 400 })
        }

        if (newPassword.length < 6) {
            return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 })
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

        // Check if new password is same as old password
        const isSamePassword = await bcrypt.compare(newPassword, user.password)
        if (isSamePassword) {
            return NextResponse.json({ error: "Mật khẩu mới không được trùng với mật khẩu cũ" }, { status: 400 })
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10)

        // Update user
        await collection.updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashedPassword,
                    updatedAt: new Date()
                },
                $unset: {
                    resetPasswordToken: "",
                    resetPasswordExpires: ""
                }
            }
        )

        return NextResponse.json({ success: true, message: "Đổi mật khẩu thành công" })

    } catch (error) {
        console.error("Reset password error:", error)
        return NextResponse.json({ error: "Đã xảy ra lỗi" }, { status: 500 })
    }
}
