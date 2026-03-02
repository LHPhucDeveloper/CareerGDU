import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import crypto from "crypto"

// Base32 decoding for TOTP verification
function base32Decode(encoded: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    let bits = ""

    for (const char of encoded.toUpperCase()) {
        const index = alphabet.indexOf(char)
        if (index >= 0) {
            bits += index.toString(2).padStart(5, "0")
        }
    }

    const bytes = []
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2))
    }

    return Buffer.from(bytes)
}

// Generate TOTP code
function generateTOTP(secret: string, time?: number): string {
    const counter = Math.floor((time || Date.now()) / 1000 / 30)
    const counterBuffer = Buffer.alloc(8)
    counterBuffer.writeBigInt64BE(BigInt(counter))

    const secretBuffer = base32Decode(secret)
    const hmac = crypto.createHmac("sha1", secretBuffer)
    hmac.update(counterBuffer)
    const hash = hmac.digest()

    const offset = hash[hash.length - 1] & 0x0f
    const code = ((hash[offset] & 0x7f) << 24 |
        (hash[offset + 1] & 0xff) << 16 |
        (hash[offset + 2] & 0xff) << 8 |
        (hash[offset + 3] & 0xff)) % 1000000

    return code.toString().padStart(6, "0")
}

// Verify TOTP code (with 1 step window for clock drift)
function verifyTOTP(token: string, secret: string): boolean {
    const now = Date.now()
    // Check current, previous and next 30-second windows
    for (let i = -1; i <= 1; i++) {
        const time = now + (i * 30 * 1000)
        if (generateTOTP(secret, time) === token) {
            return true
        }
    }
    return false
}

export async function POST(req: Request) {
    try {
        const { email, token, useRecoveryCode } = await req.json()

        if (!email || !token) {
            return NextResponse.json({ error: "Thiếu thông tin xác thực" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.USERS)
        const user = await collection.findOne({ email })

        if (!user) {
            return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 })
        }

        if (!user.totpEnabled || !user.totpSecret) {
            return NextResponse.json({ error: "Tài khoản chưa bật xác thực 2FA" }, { status: 400 })
        }

        let isValid = false

        if (useRecoveryCode) {
            // Verify recovery code
            const hashedToken = crypto.createHash("sha256").update(token.toUpperCase()).digest("hex")
            const codeIndex = user.recoveryCodes?.findIndex((code: string) => code === hashedToken)

            if (codeIndex !== undefined && codeIndex >= 0) {
                isValid = true
                // Remove used recovery code
                const newRecoveryCodes = [...user.recoveryCodes]
                newRecoveryCodes.splice(codeIndex, 1)
                await collection.updateOne(
                    { _id: user._id },
                    { $set: { recoveryCodes: newRecoveryCodes } }
                )
            }
        } else {
            // Verify TOTP token from Google Authenticator
            isValid = verifyTOTP(token, user.totpSecret)
        }

        if (!isValid) {
            return NextResponse.json({
                error: useRecoveryCode
                    ? "Mã khôi phục không đúng hoặc đã được sử dụng"
                    : "Mã xác thực không đúng. Vui lòng kiểm tra Google Authenticator."
            }, { status: 400 })
        }

        // Return user session data (same as standard login)
        const { password: _, _id, ...userWithoutPassword } = user

        const userResponse = {
            ...userWithoutPassword,
            role: user.role,
            id: _id.toString(),
            _id: _id.toString(),
            emailVerified: user.emailVerified ?? true,
            phoneVerified: user.phoneVerified ?? false,
        }

        // NEW: Create secure session cookie for Admin after 2FA
        const { createSession } = await import("@/lib/session")
        await createSession(userResponse.id, userResponse.role)

        return NextResponse.json({
            success: true,
            user: userResponse
        })

    } catch (error) {
        console.error("Verify 2FA error:", error)
        return NextResponse.json({ error: "Đã xảy ra lỗi xác thực" }, { status: 500 })
    }
}
