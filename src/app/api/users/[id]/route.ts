import { NextResponse, type NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import { getCollection, COLLECTIONS } from "@/database/connection"

export const dynamic = 'force-dynamic'
import { checkNotificationPreference } from "@/lib/notification-utils"

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid user ID" }, { status: 400 })
        }

        // SECURE: Verify authorization
        const { cookies } = await import("next/headers")
        const { decrypt } = await import("@/lib/session")
        const cookie = (await cookies()).get("session")?.value
        const session = await decrypt(cookie)

        if (!session || (session.userId !== id && session.role !== "admin")) {
            return NextResponse.json({ success: false, error: "Unauthorized: Access Denied" }, { status: 403 })
        }

        const collection = await getCollection(COLLECTIONS.USERS)

        // Project ONLY safe fields
        const safeProjection = {
            password: 0,
            totpSecret: 0,
            recoveryCodes: 0,
            totpEnabled: 0,
            __v: 0
        }

        const user = await collection.findOne(
            { _id: new ObjectId(id) },
            { projection: safeProjection }
        )

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            user: {
                ...user,
                id: user._id.toString(),
                _id: user._id.toString(),
            }
        })
    } catch (error) {
        console.error("Get user error:", error)
        return NextResponse.json(
            { success: false, error: "Failed to fetch user" },
            { status: 500 }
        )
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid user ID" }, { status: 400 })
        }

        // SECURE: Verify authorization
        const { cookies } = await import("next/headers")
        const { decrypt } = await import("@/lib/session")
        const cookie = (await cookies()).get("session")?.value
        const session = await decrypt(cookie)

        if (!session || (session.userId !== id && session.role !== "admin")) {
            return NextResponse.json({ success: false, error: "Unauthorized: Access Denied" }, { status: 403 })
        }

        const usersCollection = await getCollection(COLLECTIONS.USERS)
        const userToDelete = await usersCollection.findOne({ _id: new ObjectId(id) })
        if (!userToDelete) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        const userEmail = userToDelete.email
        const userRole = userToDelete.role

        console.log(`[API DELETE User] Deleting user ${id} (${userEmail}, ${userRole}) and all related data`)

        // 2. Cascade cleanup related data
        try {
            // Notifications for this user
            const notificationsCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)
            await notificationsCollection.deleteMany({ userId: id })

            // Saved jobs
            const savedJobsCollection = await getCollection(COLLECTIONS.SAVED_JOBS)
            await savedJobsCollection.deleteMany({ userId: id })

            // User reviews, likes and comments
            const userReviewsCollection = await getCollection(COLLECTIONS.USER_REVIEWS)
            await userReviewsCollection.deleteMany({ userId: id })

            const reviewLikesCollection = await getCollection(COLLECTIONS.REVIEW_LIKES)
            await reviewLikesCollection.deleteMany({ userId: id })

            const reviewCommentsCollection = await getCollection(COLLECTIONS.REVIEW_COMMENTS)
            await reviewCommentsCollection.deleteMany({ userId: id })

            // Applications submitted BY this user OR applications for jobs OWNED BY this user
            const applicationsCollection = await getCollection(COLLECTIONS.APPLICATIONS)
            const appDeleteResult = await applicationsCollection.deleteMany({
                $or: [
                    { applicantId: id },
                    { email: userEmail },
                    { employerId: id }
                ]
            })
            console.log(`[Cleanup] Deleted ${appDeleteResult.deletedCount} applications`)

            // Cleanup Contact messages
            const contactsCollection = await getCollection(COLLECTIONS.CONTACTS)
            const contactDeleteResult = await contactsCollection.deleteMany({
                $or: [
                    { userId: id },
                    { email: userEmail }
                ]
            })
            console.log(`[Cleanup] Deleted ${contactDeleteResult.deletedCount} contacts`)

            // If Employer/Admin, delete their jobs and applications specifically for those jobs
            if (userRole === "employer" || userRole === "admin") {
                const jobsCollection = await getCollection(COLLECTIONS.JOBS)

                // Find IDs of jobs to delete for application cleanup
                const jobsToDelete = await jobsCollection.find({ creatorId: id }).toArray()
                const jobIds = jobsToDelete.map(j => j._id.toString())

                if (jobIds.length > 0) {
                    // Delete applications to these jobs
                    await applicationsCollection.deleteMany({ jobId: { $in: jobIds } })
                    // Delete the jobs
                    await jobsCollection.deleteMany({ creatorId: id })
                }

                // Delete company profile
                const companiesCollection = await getCollection(COLLECTIONS.COMPANIES)
                await companiesCollection.deleteMany({ creatorId: id })
            }
        } catch (cleanupError) {
            console.error("[API DELETE User] Cleanup error:", cleanupError)
            // Continue with user deletion even if cleanup fails partially
        }

        // 3. Prevent deleting Admin accounts by non-root admins
        const adminEmail = process.env.ADMIN_EMAIL
        const body = await req.json().catch(() => ({})) // Try to get body for requesterEmail
        const requesterEmail = body.requesterEmail

        if (userToDelete.role === "admin" && requesterEmail !== adminEmail) {
            return NextResponse.json({ error: "Chỉ Quản trị viên gốc mới có quyền xóa tài khoản Quản trị viên." }, { status: 403 })
        }

        // 4. Finally delete the user record itself
        const result = await usersCollection.deleteOne({ _id: new ObjectId(id) })

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: "Failed to delete user record" }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: "Tài khoản và toàn bộ dữ liệu liên quan đã được xóa sạch."
        })
    } catch (error) {
        console.error("Delete user error:", error)
        return NextResponse.json(
            { success: false, error: "Failed to delete user" },
            { status: 500 }
        )
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid user ID" }, { status: 400 })
        }

        // SECURE: Verify authorization
        const { cookies } = await import("next/headers")
        const { decrypt } = await import("@/lib/session")
        const cookie = (await cookies()).get("session")?.value
        const session = await decrypt(cookie)

        if (!session || (session.userId !== id && session.role !== "admin")) {
            return NextResponse.json({ success: false, error: "Unauthorized: Access Denied" }, { status: 403 })
        }

        const collection = await getCollection(COLLECTIONS.USERS)
        const currentUser = await collection.findOne({ _id: new ObjectId(id) })

        if (!currentUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        // Root Admin and Admin management protection
        const adminEmail = process.env.ADMIN_EMAIL
        const requesterEmail = body.requesterEmail

        if (currentUser.role === "admin" && requesterEmail !== adminEmail) {
            return NextResponse.json({ error: "Chỉ Quản trị viên gốc mới có quyền chỉnh sửa tài khoản Quản trị viên." }, { status: 403 })
        }

        // Prevent updating to invalid roles if role is present
        if (body.role && !["student", "employer", "admin"].includes(body.role)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 })
        }

        // Role track restriction
        if (body.role && body.role !== currentUser.role) {
            // Simple mapping: each role is currently its own track
            // student -> only student
            // employer -> only employer
            // admin -> only admin (unless there are sub-roles in future)

            // For now, if current role is X, new role must be X (effectively disabling horizontal role change)
            // If we want to allow future vertical roles, we'd check if they belong to the same category.
            const tracks = {
                student: ["student"],
                employer: ["employer"],
                admin: ["admin"]
            }

            const currentTrack = Object.entries(tracks).find(([_, roles]) => roles.includes(currentUser.role))?.[0]
            const newRoleInSameTrack = currentTrack && tracks[currentTrack as keyof typeof tracks].includes(body.role)

            if (!newRoleInSameTrack) {
                return NextResponse.json({
                    error: `Không thể đổi vai trò từ ${currentUser.role} sang ${body.role}. Đổi vai trò chỉ áp dụng cho tài khoản cùng luồng.`
                }, { status: 400 })
            }
        }

        // Create explicit update object to prevent unexpected field updates
        const allowedFields = [
            "name", "phone", "studentId", "major", "faculty", "cohort",
            "avatar", "companyName", "website", "address", "description",
            "size", "contactPerson", "industry", "status", "role"
        ];

        const updateData: any = {
            updatedAt: new Date()
        };

        // Transfer only allowed fields from body
        Object.keys(body).forEach(key => {
            if (allowedFields.includes(key)) {
                updateData[key] = body[key];
            }
        });

        // Special check: studentId uniqueness
        if (body.studentId && body.studentId !== currentUser.studentId) {
            console.log(`[API PATCH User] Checking uniqueness for MSSV: ${body.studentId} (Current: ${currentUser.studentId})`)
            // Validate format
            if (!/^\d{8}$/.test(body.studentId)) {
                return NextResponse.json({ error: "Mã số sinh viên phải có đủ 8 số" }, { status: 400 });
            }

            const existingStudentId = await collection.findOne({
                studentId: body.studentId,
                _id: { $ne: new ObjectId(id) } // Exclude current user
            });

            console.log(`[API PATCH User] MSSV Conflict Search Result:`, existingStudentId ? "Found (CONFLICT)" : "Not Found (OK)")

            if (existingStudentId) {
                return NextResponse.json({ error: "Mã số sinh viên này đã được đăng ký bởi tài khoản khác." }, { status: 409 });
            }
            updateData.studentId = body.studentId;
        }

        // Special check: email update is sensitive and usually shouldn't happen via general profile edit
        // But if allowed, we should probably check for uniqueness.
        // For now, let's allow it but warn or restrict if needed.
        if (body.email && body.email !== currentUser.email) {
            const existingEmail = await collection.findOne({ email: body.email });
            if (existingEmail) {
                return NextResponse.json({ error: "Email này đã được sử dụng bởi tài khoản khác." }, { status: 409 });
            }
            updateData.email = body.email;
        }

        console.log(`[API PATCH User] Request body for ID ${id}:`, JSON.stringify(body))
        console.log(`[API PATCH User] Effective updateData:`, JSON.stringify(updateData))

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        )

        console.log(`[API PATCH User] Update result: matched=${result.matchedCount}, modified=${result.modifiedCount}`)

        // NEW: Send Approval Email to Employer
        if (
            currentUser.role === 'employer' &&
            currentUser.status === 'pending' &&
            updateData.status === 'active'
        ) {
            try {
                const shouldSendEmail = await checkNotificationPreference(id, 'email')

                if (shouldSendEmail) {
                    const { sendEmail } = await import("@/services/email.service")
                    await sendEmail({
                        to: currentUser.email,
                        subject: "Tài khoản Nhà tuyển dụng đã được phê duyệt - GDU Career",
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
                                <div style="background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%); color: white; padding: 40px 20px; text-align: center;">
                                    <h1 style="margin: 0; font-size: 28px;">Chúc mừng!</h1>
                                    <p style="margin: 10px 0 0; opacity: 0.9; font-size: 18px;">Tài khoản của bạn đã được phê duyệt</p>
                                </div>
                                <div style="padding: 30px; background-color: #ffffff;">
                                    <h2 style="color: #333; margin-top: 0;">Xin chào ${currentUser.contactPerson || currentUser.name},</h2>
                                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                                        Chúng tôi rất vui mừng thông báo rằng hồ sơ doanh nghiệp của bạn tại <strong>GDU Career Portal</strong> đã được Admin phê duyệt thành công.
                                    </p>
                                    <div style="background-color: #f9f9f9; border-left: 4px solid #d32f2f; padding: 20px; margin: 25px 0;">
                                        <p style="margin: 0; color: #333; font-weight: bold;">Bây giờ bạn có thể:</p>
                                        <ul style="margin: 10px 0 0; color: #555; padding-left: 20px;">
                                            <li>Đăng tin tuyển dụng không giới hạn</li>
                                            <li>Quản lý hồ sơ ứng viên trực tuyến</li>
                                            <li>Xây dựng thương hiệu nhà tuyển dụng tại GDU</li>
                                        </ul>
                                    </div>
                                    <div style="text-align: center; margin-top: 35px;">
                                        <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}/login?approved=true" 
                                           style="background-color: #d32f2f; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; transition: background-color 0.3s;">
                                            Đăng nhập ngay
                                        </a>
                                    </div>
                                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                                    <p style="color: #999; font-size: 13px; text-align: center;">
                                        Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ bộ phận hỗ trợ của chúng tôi tại <a href="mailto:support@gdu.edu.vn" style="color: #d32f2f;">support@gdu.edu.vn</a>
                                    </p>
                                </div>
                            </div>
                        `
                    })
                    console.log(`[Users API] Approval email sent to: ${currentUser.email}`)
                } else {
                    console.log(`[Users API] Approval email skipped for ${currentUser.email} (preference off)`)
                }
            } catch (emailErr) {
                console.error("[Users API] Failed to send approval email:", emailErr)
            }

            // Create In-App Notification for Employer
            try {
                const notificationsCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)
                await notificationsCollection.insertOne({
                    userId: id,
                    type: "system",
                    title: "Tài khoản đã được phê duyệt!",
                    message: `Chào mừng ${currentUser.companyName || currentUser.name}! Tài khoản của bạn đã được kích hoạt. Bạn có thể bắt đầu đăng tuyển công việc ngay bây giờ.`,
                    read: false,
                    createdAt: new Date(),
                    link: "/dashboard"
                })
                console.log(`[Users API] In-app notification created for: ${id}`)
            } catch (notifErr) {
                console.error("[Users API] Failed to create approval notification:", notifErr)
            }
        }

        console.log(`[API PATCH User] Update result for ${id}: matched=${result.matchedCount}, modified=${result.modifiedCount}`)

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        // Fetch the updated user to return to the frontend
        // Using the same safe projection we used in GET
        const safeProjection = {
            password: 0,
            totpSecret: 0,
            recoveryCodes: 0,
            totpEnabled: 0,
            __v: 0
        };
        const updatedUserRaw = await collection.findOne({ _id: new ObjectId(id) }, { projection: safeProjection });
        const updatedUser = updatedUserRaw ? {
            ...updatedUserRaw,
            id: updatedUserRaw._id.toString(),
            _id: updatedUserRaw._id.toString()
        } : null;

        return NextResponse.json({
            success: true,
            message: "User updated successfully",
            user: updatedUser
        })
    } catch (error) {
        console.error("Update user error:", error)
        return NextResponse.json(
            { success: false, error: "Failed to update user" },
            { status: 500 }
        )
    }
}
