import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import bcrypt from "bcryptjs"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const role = searchParams.get("role") // Filter by role if needed

        // SECURE: Verify the requester is an admin
        const { cookies } = await import("next/headers")
        const { decrypt } = await import("@/lib/session")
        const cookie = (await cookies()).get("session")?.value
        const session = await decrypt(cookie)

        if (!session || session.role !== "admin") {
            return NextResponse.json({ success: false, error: "Unauthorized: Access Denied" }, { status: 403 })
        }

        const collection = await getCollection(COLLECTIONS.USERS)

        let query: any = {}
        if (role && role !== 'all') {
            query.role = role
        }

        // Project ONLY safe fields
        const safeProjection = {
            password: 0,
            totpSecret: 0,
            recoveryCodes: 0,
            totpEnabled: 0,
            __v: 0
        }

        const users = await collection
            .find(query)
            .sort({ createdAt: -1 })
            .project(safeProjection)
            .toArray()

        return NextResponse.json({
            success: true,
            users: users.map(user => ({
                ...user,
                _id: user._id.toString(),
                id: user._id.toString()
            })),
        })
    } catch (error) {
        console.error("Error fetching users:", error)
        return NextResponse.json({ success: false, error: "Failed to fetch users" }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, email, password, role, creatorEmail } = body

        // Root Admin verification
        const adminEmail = process.env.ADMIN_EMAIL
        if (creatorEmail !== adminEmail) {
            return NextResponse.json({ error: "Chỉ Quản trị viên gốc mới có quyền tạo tài khoản trực tiếp." }, { status: 403 })
        }

        if (!name || !email || !password || !role) {
            return NextResponse.json({ error: "Vui lòng nhập đầy đủ thông tin" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.USERS)
        const existingUser = await collection.findOne({ email })

        if (existingUser) {
            return NextResponse.json({ error: "Email này đã được sử dụng." }, { status: 409 })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const newUser = {
            name,
            email,
            password: hashedPassword,
            role,
            emailVerified: true,

            // 🔐 Chỉ admin mới có 2FA
            totpEnabled: role === "admin" ? false : undefined,
            // totpSecret: role === "admin" ? null : undefined,
            // recoveryCodes: role === "admin" ? [] : undefined,

            avatar: `/placeholder.svg?height=100&width=100&query=${encodeURIComponent(name)}`,
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        const result = await collection.insertOne(newUser)

        return NextResponse.json({
            success: true,
            message: "Tạo tài khoản thành công!",
            userId: result.insertedId.toString()
        })
    } catch (error) {
        console.error("Create user error:", error)
        return NextResponse.json({ success: false, error: "Failed to create user" }, { status: 500 })
    }
}
