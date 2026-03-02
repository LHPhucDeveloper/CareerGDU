import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "../../../../database/connection"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { sendEmail } from "../../../../services/email.service"

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Hash OTP for secure storage
function hashOTP(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex")
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, password, phone, role: requestedRole, studentId, major } = body
    const role = requestedRole === "admin" ? "student" : (requestedRole || "student")

    // Validate required fields
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 })
    }

    // Validate phone number format
    if (phone && !/^0\d{9,10}$/.test(phone)) {
      return NextResponse.json({ error: "Số điện thoại phải bắt đầu bằng số 0 và có 10-11 số" }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const collection = await getCollection(COLLECTIONS.USERS)
    const pendingCollection = await getCollection(COLLECTIONS.PENDING_USERS)

    // 1. Check if email exists in main USERS collection (Verified accounts)
    const existingVerifiedUser = await collection.findOne({ email: normalizedEmail, emailVerified: true })
    if (existingVerifiedUser) {
      return NextResponse.json({ error: "Email đã được sử dụng" }, { status: 409 })
    }

    // 2. Check if user exists in PENDING_USERS or is unverified in USERS (Legacy case)
    let pendingUser = await pendingCollection.findOne({ email: normalizedEmail })
    let foundInPending = !!pendingUser

    if (!pendingUser) {
      // Check for legacy unverified user in main collection
      pendingUser = await collection.findOne({ email: normalizedEmail, emailVerified: false })
    }

    if (pendingUser) {
      // Generate new OTP
      const otp = generateOTP()
      const hashedOTP = hashOTP(otp)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

      // Update the relevant collection
      const targetCollection = foundInPending ? pendingCollection : collection
      await targetCollection.updateOne(
        { email: normalizedEmail },
        {
          $set: {
            name, // Update name/data in case they changed it
            password: await bcrypt.hash(password, 10),
            phone,
            role,
            studentId,
            major,
            emailOtp: hashedOTP,
            emailOtpExpires: expiresAt,
            updatedAt: new Date()
          },
        }
      )

      // Send OTP email (non-blocking)
      sendEmail({
        to: email,
        subject: "Mã xác minh tài khoản GDU Career",
        html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="margin: 0; font-size: 24px;">GDU Career Portal</h1>
                  <p style="margin: 10px 0 0; opacity: 0.9;">Xác minh tài khoản</p>
                </div>
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                  <h2 style="color: #1e3a5f; margin-top: 0;">Xin chào ${name}!</h2>
                  <p style="color: #666;">Đây là mã xác minh mới của bạn:</p>
                  <div style="background: #1e3a5f; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; letter-spacing: 8px; margin: 20px 0;">
                    ${otp}
                  </div>
                  <p style="color: #999; font-size: 14px; text-align: center;">Mã này sẽ hết hạn sau <strong>5 phút</strong></p>
                </div>
              </div>
            `,
      }).catch(err => console.error("Background email error:", err))

      return NextResponse.json({
        success: true,
        needsVerification: true,
        email: email,
        message: "Tài khoản đang chờ xác minh. Mã OTP mới đã được gửi.",
      })
    }

    // Check if studentId already exists (only for students)
    if (role === "student") {
      if (!studentId || !/^\d{8}$/.test(studentId)) {
        return NextResponse.json({ error: "Mã số sinh viên phải có đủ 8 số" }, { status: 400 })
      }

      const existingStudentId = await collection.findOne({ studentId })
      if (existingStudentId) {
        return NextResponse.json({ error: "Mã số sinh viên đã được đăng ký" }, { status: 409 })
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Prepare new user object in PENDING collection
    const newUser: any = {
      name,
      password: hashedPassword,
      role: role,
      email: normalizedEmail,
      phone: phone || "",
      emailVerified: false,
      status: role === "employer" ? "pending" : "active",
      avatar: `/placeholder.svg?height=100&width=100&query=${encodeURIComponent(name)}`,
      createdAt: new Date(),
    }

    if (role === "student") {
      newUser.studentId = studentId || ""
      newUser.major = major || ""
    }

    if (role === "employer") {
      newUser.contactPerson = body.contactPerson || ""
      newUser.companyName = body.companyName || ""
      newUser.companyType = body.companyType || ""
      newUser.companySize = body.companySize || ""
      newUser.foreignCapital = body.foreignCapital || false
      newUser.province = body.province || ""
      newUser.industry = body.industry || ""
      newUser.address = body.address || ""
    }

    const otp = generateOTP()
    newUser.emailOtp = hashOTP(otp)
    newUser.emailOtpExpires = new Date(Date.now() + 5 * 60 * 1000)

    // Insert into PENDING collection
    await pendingCollection.insertOne(newUser)

    // Send Email OTP (non-blocking)
    sendEmail({
      to: email,
      subject: "Mã xác minh tài khoản GDU Career",
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">GDU Career Portal</h1>
                    <p style="margin: 10px 0 0; opacity: 0.9;">Chào mừng bạn đến với GDU Career!</p>
                  </div>
                  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #1e3a5f; margin-top: 0;">Xin chào ${name}!</h2>
                    <p style="color: #666; line-height: 1.6;">
                      Cảm ơn bạn đã đăng ký tài khoản. Vui lòng nhập mã xác minh dưới đây để hoàn tất:
                    </p>
                    <div style="background: #1e3a5f; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; letter-spacing: 8px; margin: 20px 0;">
                      ${otp}
                    </div>
                    <p style="color: #999; font-size: 14px; text-align: center;">
                      Mã này sẽ hết hạn sau <strong>5 phút</strong>
                    </p>
                  </div>
                </div>
              `,
    }).catch(err => console.error("Background email error:", err))

    // NEW: Notify Admin immediately about new registration (especially Employers)
    try {
      const notificationsCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)
      const isEmployer = role === "employer"

      await notificationsCollection.insertOne({
        targetRole: "admin",
        type: "system",
        title: isEmployer ? "Yêu cầu đăng ký Nhà tuyển dụng mới" : "Người dùng mới đăng ký",
        message: isEmployer
          ? `${newUser.companyName || name} vừa đăng ký. Chờ xác minh email và phê duyệt.`
          : `${name} vừa đăng ký tài khoản sinh viên.`,
        read: false,
        createdAt: new Date(),
        link: isEmployer ? "/dashboard/users?role=employer" : "/dashboard/users"
      })
    } catch (notifError) {
      console.error("Failed to create admin notification:", notifError)
    }

    return NextResponse.json({
      success: true,
      needsVerification: true,
      email: email,
      message: "Đăng ký thành công! Vui lòng xác minh tài khoản.",
    })
  } catch (error) {
    console.error("Register error:", error)
    return NextResponse.json({ error: "Có lỗi xảy ra. Vui lòng thử lại." }, { status: 500 })
  }
}
