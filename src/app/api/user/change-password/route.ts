import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { userId, currentPassword, newPassword, otp } = body

        console.log("[API] Change Password Request:", {
            userId,
            hasCurrentPass: !!currentPassword,
            hasNewPass: !!newPassword,
            hasOtp: !!otp
        })

        if (!userId || !currentPassword || !newPassword) {
            return NextResponse.json(
                { error: "Vui lòng điền đầy đủ thông tin" },
                { status: 400 }
            )
        }

        if (newPassword.length < 6) {
            return NextResponse.json(
                { error: "Mật khẩu mới phải có ít nhất 6 ký tự" },
                { status: 400 }
            )
        }

        // Get user from database
        const collection = await getCollection(COLLECTIONS.USERS)
        const user = await collection.findOne({ _id: new ObjectId(userId) })

        if (!user) {
            console.log("[API] User not found for ID:", userId)
            return NextResponse.json(
                { error: "Không tìm thấy người dùng" },
                { status: 404 }
            )
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password)

        if (!isPasswordValid) {
            console.log("[API] Invalid current password for user:", userId)
            return NextResponse.json(
                { error: "Mật khẩu hiện tại không đúng" },
                { status: 401 }
            )
        }

        // For admin users, require OTP verification
        if (user.role === "admin") {
            if (!otp) {
                return NextResponse.json(
                    { error: "Vui lòng nhập mã OTP để xác thực", requiresOtp: true },
                    { status: 400 }
                )
            }

            // Verify OTP
            if (user.passwordChangeOtp !== otp || !user.passwordChangeOtpExpires || new Date() > new Date(user.passwordChangeOtpExpires)) {
                return NextResponse.json(
                    { error: "Mã OTP không chính xác hoặc đã hết hạn" },
                    { status: 400 }
                )
            }
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10)

        // Update password in database and clear OTP tokens
        await collection.updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    password: hashedPassword,
                    updatedAt: new Date()
                },
                $unset: {
                    passwordChangeOtp: "",
                    passwordChangeOtpExpires: ""
                }
            }
        )

        return NextResponse.json({
            success: true,
            message: "Đổi mật khẩu thành công!"
        })

    } catch (error) {
        console.error("[API] Change password error:", error)
        return NextResponse.json(
            { error: "Đổi mật khẩu thất bại. Vui lòng thử lại." },
            { status: 500 }
        )
    }
}
