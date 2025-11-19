# CR-015: Implement Access Control & User Roles

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 6 (Production Readiness)
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

The system currently lacks access control and user role management. According to [implan.md:340-344](../implan.md#L340-L344), production deployment requires:

- User roles: owner, admin, editor, viewer
- Workspace-level permissions
- Return 403 on access violations
- Multi-tenant security

**Current Status:** NOT IMPLEMENTED (Phase 6 feature)

**Impact:** Without access control:
- No multi-tenant security (users can access each other's workspaces)
- No collaboration controls (cannot share with read-only access)
- Production deployment blocked (security requirement)
- Cannot enforce organizational policies

## Requirements

**From implan.md Phase 6 requirements:**

1. **User Roles:**
   - **Owner:** Full control, can delete workspace
   - **Admin:** Manage users, modify settings
   - **Editor:** Create/modify/delete entities
   - **Viewer:** Read-only access

2. **Workspace Permissions:**
   - Workspace-level isolation (multi-tenant)
   - Role assignments per workspace
   - Invitation and access revocation

3. **Access Control:**
   - Return 403 Forbidden on violations
   - Enforce permissions at API level
   - Audit permission changes

## Proposed Solution

### 1. User Role System

```typescript
enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer'
}

interface Permission {
  workspace: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    manageUsers: boolean;
    manageSettings: boolean;
  };
  entity: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
  };
  chat: {
    create: boolean;
    read: boolean;
  };
}

const ROLE_PERMISSIONS: Record<UserRole, Permission> = {
  [UserRole.OWNER]: {
    workspace: { create: true, read: true, update: true, delete: true, manageUsers: true, manageSettings: true },
    entity: { create: true, read: true, update: true, delete: true },
    chat: { create: true, read: true }
  },
  [UserRole.ADMIN]: {
    workspace: { create: false, read: true, update: true, delete: false, manageUsers: true, manageSettings: true },
    entity: { create: true, read: true, update: true, delete: true },
    chat: { create: true, read: true }
  },
  [UserRole.EDITOR]: {
    workspace: { create: false, read: true, update: false, delete: false, manageUsers: false, manageSettings: false },
    entity: { create: true, read: true, update: true, delete: true },
    chat: { create: true, read: true }
  },
  [UserRole.VIEWER]: {
    workspace: { create: false, read: true, update: false, delete: false, manageUsers: false, manageSettings: false },
    entity: { create: false, read: true, update: false, delete: false },
    chat: { create: false, read: true }
  }
};
```

### 2. Workspace Membership

```typescript
interface WorkspaceMember {
  userId: string;
  workspaceId: string;
  role: UserRole;
  invitedBy: string;
  invitedAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
}

interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
}
```

**Neo4j Schema:**
```cypher
// User node
CREATE (u:User {
  id: 'user-123',
  email: 'user@example.com',
  name: 'John Doe'
})

// Workspace node
CREATE (w:Workspace {
  id: 'workspace-456',
  name: 'Project Alpha',
  ownerId: 'user-123'
})

// Membership relationship
CREATE (u)-[:MEMBER_OF {
  role: 'editor',
  invitedAt: datetime(),
  acceptedAt: datetime()
}]->(w)
```

### 3. Permission Enforcement

```typescript
class AccessControlService {
  async checkPermission(
    userId: string,
    workspaceId: string,
    resource: 'workspace' | 'entity' | 'chat',
    action: 'create' | 'read' | 'update' | 'delete' | 'manageUsers' | 'manageSettings'
  ): Promise<boolean> {
    const role = await this.getUserRole(userId, workspaceId);
    if (!role) return false;

    const permissions = ROLE_PERMISSIONS[role];
    return permissions[resource][action] === true;
  }

  async enforcePermission(
    userId: string,
    workspaceId: string,
    resource: string,
    action: string
  ): Promise<void> {
    const allowed = await this.checkPermission(userId, workspaceId, resource, action);
    if (!allowed) {
      throw new ForbiddenError(`User ${userId} lacks permission ${action} on ${resource} in workspace ${workspaceId}`);
    }
  }
}
```

### 4. API Integration

**Express Middleware:**
```typescript
function requirePermission(resource: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const workspaceId = req.params.workspaceId || req.body.workspaceId;

    try {
      await accessControl.enforcePermission(userId, workspaceId, resource, action);
      next();
    } catch (error) {
      if (error instanceof ForbiddenError) {
        res.status(403).json({ error: error.message });
      } else {
        next(error);
      }
    }
  };
}

// Usage
router.post('/workspaces/:workspaceId/entities',
  requirePermission('entity', 'create'),
  createEntity
);

router.delete('/workspaces/:workspaceId',
  requirePermission('workspace', 'delete'),
  deleteWorkspace
);
```

### 5. Invitation & Collaboration

```typescript
interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
}

class CollaborationService {
  async inviteUser(
    workspaceId: string,
    email: string,
    role: UserRole,
    invitedBy: string
  ): Promise<WorkspaceInvitation> {
    // Create invitation with unique token
    // Send email with invitation link
    // Expire after 7 days
  }

  async acceptInvitation(token: string, userId: string): Promise<void> {
    // Validate token
    // Create membership relationship
    // Mark invitation as accepted
  }

  async revokeAccess(workspaceId: string, userId: string): Promise<void> {
    // Remove membership relationship
    // Terminate active sessions
    // Audit log revocation
  }
}
```

## Implementation Plan

### Phase 1: User & Workspace Models (3-4 hours)
1. Create `src/auth/user-model.ts`
2. Create `src/auth/workspace-model.ts`
3. Define Neo4j schema for users and workspaces
4. Implement membership relationship model

### Phase 2: Access Control Service (4-5 hours)
1. Create `src/auth/access-control-service.ts`
2. Implement role permission definitions
3. Implement checkPermission() logic
4. Implement enforcePermission() middleware
5. Add permission caching for performance

### Phase 3: API Integration (3-4 hours)
1. Add authentication middleware (JWT or session)
2. Add permission middleware to all routes
3. Return 403 on access violations
4. Add workspace context to all operations
5. Test permission enforcement

### Phase 4: Collaboration Features (4-5 hours)
1. Create `src/auth/collaboration-service.ts`
2. Implement invitation system
3. Add email notification integration
4. Implement access revocation
5. Add invitation expiration handling

### Phase 5: Audit & Logging (2-3 hours)
1. Log all permission checks (success/failure)
2. Log membership changes
3. Log workspace access attempts
4. Create audit log query API

### Phase 6: Testing & Security Review (4-5 hours)
1. Write unit tests for access control logic
2. Write integration tests for permission enforcement
3. Test multi-tenant isolation
4. Security review (OWASP checklist)
5. Performance testing (permission checks <10ms)

## Acceptance Criteria

- [ ] User roles (owner, admin, editor, viewer) implemented
- [ ] Workspace-level permissions enforced
- [ ] All API endpoints protected with permission checks
- [ ] 403 Forbidden returned on access violations
- [ ] Multi-tenant isolation validated (no cross-workspace access)
- [ ] Invitation system functional (email, token, expiration)
- [ ] Access revocation works (terminates sessions)
- [ ] Audit logs capture permission events
- [ ] Unit tests cover access control logic (70% coverage)
- [ ] Security review passed (no critical vulnerabilities)

## Dependencies

- User authentication system (JWT or session-based)
- Neo4j for user/workspace/membership storage
- Email service for invitations
- WebSocket server for real-time permission updates

## Estimated Effort

- User & Workspace Models: 3-4 hours
- Access Control Service: 4-5 hours
- API Integration: 3-4 hours
- Collaboration Features: 4-5 hours
- Audit & Logging: 2-3 hours
- Testing & Security Review: 4-5 hours
- **Total: 20-26 hours (3-4 days)**

## Benefits

**Security:**
- Multi-tenant isolation prevents data leaks
- Role-based access prevents unauthorized changes
- Audit logs enable compliance and forensics

**Collaboration:**
- Safe workspace sharing (read-only viewers)
- Controlled delegation (admin role)
- Invitation-based onboarding

**Production Readiness:**
- Meets enterprise security requirements
- Enables SaaS deployment model
- Supports organizational policies

## References

- [implan.md:340-344](../implan.md#L340-L344) - Phase 6 Access Control section
- requirements.md NFR-4 - Security requirements
- OWASP Top 10 - Security best practices

## Notes

- Implement after core features stable (Phase 6 priority)
- Consider OAuth integration for enterprise SSO
- Permission checks must be fast (<10ms) - implement caching
- Test multi-tenant isolation thoroughly (critical security boundary)
- Consider rate limiting per workspace to prevent abuse
