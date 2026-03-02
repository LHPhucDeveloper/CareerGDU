import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body
    const normalizedEmail = email.toLowerCase().trim()

    const collection = await getCollection(COLLECTIONS.USERS)

    // Find user by email
    const user = await collection.findOne({ email: normalizedEmail })
    console.log(`[Login Debug] Email: ${normalizedEmail}, Found: ${!!user}`)

    if (!user) {
      return NextResponse.json({ error: "Email chưa được đăng ký" }, { status: 401 })
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password)
    console.log(`[Login Debug] Password Match: ${passwordMatch}`)

    if (!passwordMatch) {
      return NextResponse.json({ error: "Mật khẩu không đúng" }, { status: 401 })
    }

    // Check if email is verified
    // Allow old users who don't have emailVerified field (treat as verified)
    if (user.emailVerified === false) {
      return NextResponse.json({
        error: "Tài khoản chưa được xác minh",
        needsVerification: true,
        email: user.email
      }, { status: 403 })
    }

    // Check for employer approval status
    if (user.role === "employer" && user.status === "pending") {
      return NextResponse.json({
        error: "Tài khoản đang chờ Admin phê duyệt. Vui lòng kiểm tra email hoặc liên hệ Admin.",
        pendingApproval: true
      }, { status: 403 })
    }

    // Remove password from response for general user object
    const { password: _, _id, ...userWithoutPassword } = user

    // Return user with both id and _id for compatibility
    const userResponse = {
      ...userWithoutPassword,
      role: user.role, // Explicitly include role for createSession
      id: _id.toString(),
      _id: _id.toString(),
      emailVerified: user.emailVerified ?? true, // Old users without field are verified
      phoneVerified: user.phoneVerified ?? false,
    }

    // 2FA for Admin Role
    if (user.role === "admin") {
      // totpEnabled = null/undefined => bypass and login normally (per your requirement)
      // totpEnabled = false => require initial Google Authenticator setup (QR + verify)
      // totpEnabled = true => require TOTP (Google Authenticator) before creating session

      if (user.totpEnabled === true) {
        // Admin has 2FA enabled - do NOT set session yet, wait for verify-2fa
        return NextResponse.json({
          success: true,
          needs2FA: true,
          totpEnabled: true,
          email: user.email,
        })
      }

      if (user.totpEnabled === false) {
        return NextResponse.json({
          success: true,
          needs2FA: true,
          needsTotpSetup: true,
          totpEnabled: false,
          email: user.email,
          userId: userResponse.id,
        })
      }
    }

    // NEW: Create secure session cookie for non-admin users
    const { createSession } = await import("@/lib/session")
    console.log(`[Login Debug] Creating session for: ${userResponse.id}, role: ${userResponse.role}`)
    await createSession(userResponse.id, userResponse.role)

    return NextResponse.json({
      success: true,
      user: userResponse,
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Có lỗi xảy ra. Vui lòng thử lại." }, { status: 500 })
  }
}
