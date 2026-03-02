import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import crypto from "crypto"

// Hash OTP for secure storage
function hashOTP(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex")
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { email, otp, type } = body
        const normalizedEmail = email?.toLowerCase().trim();

        if (!normalizedEmail || !otp) {
            return NextResponse.json({ error: "Thiếu thông tin xác thực" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.USERS)
        const pendingCollection = await getCollection(COLLECTIONS.PENDING_USERS)

        // 1. First, search in main USERS (Legacy unverified users or already verified)
        let user = await collection.findOne({ email: normalizedEmail })
        let isFromPending = false

        if (!user) {
            // 2. Search in PENDING collection
            user = await pendingCollection.findOne({ email: normalizedEmail })
            isFromPending = true
        }

        if (!user) {
            return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 })
        }

        // Check if already verified
        if (user.emailVerified) {
            return NextResponse.json({
                success: true,
                message: "Email đã được xác minh trước đó",
                data: { user: { ...user, id: user._id.toString() } }
            })
        }

        // Validate OTP
        const hashedInputOtp = hashOTP(otp)

        if (user.emailOtp !== hashedInputOtp) {
            return NextResponse.json({ error: "Mã OTP không chính xác" }, { status: 400 })
        }

        if (new Date() > new Date(user.emailOtpExpires)) {
            return NextResponse.json({ error: "Mã OTP đã hết hạn" }, { status: 400 })
        }

        // OTP Valid - Finalize User Creation
        const { _id, emailOtp, emailOtpExpires, ...userData } = user
        const finalizedUser = {
            ...userData,
            emailVerified: true,
            updatedAt: new Date()
        }

        if (isFromPending) {
            // Move from PENDING to USERS
            // Use replaceOne with upsert to ensure we don't create duplicates and replace any existing junk
            await collection.replaceOne(
                { email: normalizedEmail },
                finalizedUser,
                { upsert: true }
            )
            await pendingCollection.deleteOne({ _id })
        } else {
            // Legacy unverified user in main collection
            await collection.updateOne(
                { email: normalizedEmail },
                {
                    $set: {
                        emailVerified: true,
                        updatedAt: new Date()
                    },
                    $unset: {
                        emailOtp: "",
                        emailOtpExpires: ""
                    }
                }
            )
        }

        // Send notification to Admin after verification
        if (process.env.ADMIN_EMAIL) {
            try {
                // Inline import to avoid potential circular dependencies
                const { sendEmail } = await import("@/services/email.service")

                // Customize message based on role
                const isEmployer = user.role === "employer"
                const subject = isEmployer
                    ? `🏢 Nhà tuyển dụng mới đăng ký: ${user.companyName || user.name}`
                    : `✨ Người dùng mới đã xác minh: ${user.name}`

                const htmlContent = isEmployer
                    ? `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #D32F2F;">Nhà tuyển dụng mới cần phê duyệt</h2>
                        <p>Một nhà tuyển dụng mới vừa xác minh email và đang chờ phê duyệt.</p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                        <h3 style="color: #333;">Thông tin doanh nghiệp:</h3>
                        <ul>
                            <li><strong>Tên công ty:</strong> ${user.companyName || "Chưa cập nhật"}</li>
                            <li><strong>Người liên hệ:</strong> ${user.contactPerson || user.name}</li>
                            <li><strong>Email:</strong> ${user.email}</li>
                            <li><strong>SĐT:</strong> ${user.phone || "Chưa cập nhật"}</li>
                            <li><strong>Quy mô:</strong> ${user.companySize || "N/A"}</li>
                            <li><strong>Ngành nghề:</strong> ${user.industry || "N/A"}</li>
                        </ul>
                        <div style="margin-top: 30px; text-align: center;">
                            <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/users?role=employer" 
                                style="background-color: #D32F2F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                Xem và Phê duyệt
                            </a>
                        </div>
                        </div>
                    `
                    : `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #0F52BA;">Người dùng mới đã xác minh tài khoản</h2>
                        <p>Thông tin chi tiết:</p>
                        <ul>
                            <li><strong>Họ tên:</strong> ${user.name}</li>
                            <li><strong>Email:</strong> ${user.email}</li>
                            <li><strong>Vai trò:</strong> ${user.role || "student"}</li>
                        </ul>
                        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/users" 
                            style="background-color: #0F52BA; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Quản lý người dùng
                        </a>
                        </div>
                    `

                await sendEmail({
                    to: process.env.ADMIN_EMAIL!,
                    subject: subject,
                    html: htmlContent
                })

                // Create In-App Notification for Admin
                if (isEmployer) {
                    const notificationsCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)
                    await notificationsCollection.insertOne({
                        userId: undefined, // Broadcast/Targeted to role
                        targetRole: "admin",
                        type: "system",
                        title: "Nhà tuyển dụng mới chờ duyệt",
                        message: `${user.companyName || user.name} vừa đăng ký tài khoản nhà tuyển dụng.`,
                        read: false,
                        createdAt: new Date(),
                        link: "/dashboard/users?role=employer"
                    })
                }

            } catch (emailError) {
                console.error("Failed to trigger admin notification:", emailError)
            }
        }

        // Get updated user WITHOUT password
        const updatedUser = await collection.findOne({ email: normalizedEmail }, { projection: { password: 0 } })

        if (!updatedUser) {
            return NextResponse.json({ error: "Lỗi sau khi cập nhật xác minh" }, { status: 500 })
        }

        const userResponse = {
            ...updatedUser,
            id: updatedUser._id.toString(),
            _id: updatedUser._id.toString(),
            emailVerified: true
        }

        return NextResponse.json({
            success: true,
            message: "Xác minh thành công",
            data: {
                user: userResponse,
                needsPhoneVerification: false
            }
        })

    } catch (error) {
        console.error("Verify OTP error:", error)
        return NextResponse.json({ error: "Lỗi máy chủ" }, { status: 500 })
    }
}
