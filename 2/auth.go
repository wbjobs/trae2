package federated

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Permission struct {
	Resource   string
	Action     string
	Conditions map[string]interface{}
	Effect     string
}

type Role struct {
	Name        string
	Permissions []*Permission
	Inherits    []string
}

type User struct {
	ID       string
	Username string
	Roles    []string
	Groups   []string
	Active   bool
}

type AuthPolicy struct {
	Name        string
	Description string
	Roles       map[string]*Role
	Users       map[string]*User
}

type AuthManager struct {
	policies     map[string]*AuthPolicy
	roleCache    map[string]*Role
	userCache    map[string]*User
	cacheTTL     time.Duration
	lastRefresh  time.Time
	mu           sync.RWMutex
	defaultPolicy string
	strictMode   bool
}

type AuthOption func(*AuthManager)

func WithStrictMode(strict bool) AuthOption {
	return func(m *AuthManager) {
		m.strictMode = strict
	}
}

func WithDefaultPolicy(name string) AuthOption {
	return func(m *AuthManager) {
		m.defaultPolicy = name
	}
}

func WithCacheTTL(ttl time.Duration) AuthOption {
	return func(m *AuthManager) {
		m.cacheTTL = ttl
	}
}

func NewAuthManager(opts ...AuthOption) *AuthManager {
	m := &AuthManager{
		policies:      make(map[string]*AuthPolicy),
		roleCache:     make(map[string]*Role),
		userCache:     make(map[string]*User),
		cacheTTL:      5 * time.Minute,
		defaultPolicy: "default",
		strictMode:    true,
	}
	for _, opt := range opts {
		opt(m)
	}
	m.initializeDefaultPolicy()
	return m
}

func (m *AuthManager) initializeDefaultPolicy() {
	adminRole := &Role{
		Name: "admin",
		Permissions: []*Permission{
			{
				Resource: "*",
				Action:   "*",
				Effect:   "allow",
			},
		},
	}

	readerRole := &Role{
		Name: "reader",
		Permissions: []*Permission{
			{
				Resource: "*",
				Action:   "SELECT",
				Effect:   "allow",
			},
		},
	}

	writerRole := &Role{
		Name: "writer",
		Inherits: []string{"reader"},
		Permissions: []*Permission{
			{
				Resource: "*",
				Action:   "INSERT",
				Effect:   "allow",
			},
			{
				Resource: "*",
				Action:   "UPDATE",
				Effect:   "allow",
			},
		},
	}

	policy := &AuthPolicy{
		Name:        "default",
		Description: "Default federated query authorization policy",
		Roles: map[string]*Role{
			"admin":  adminRole,
			"reader": readerRole,
			"writer": writerRole,
		},
		Users: make(map[string]*User),
	}

	m.policies["default"] = policy
}

func (m *AuthManager) AddPolicy(policy *AuthPolicy) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.policies[policy.Name]; exists {
		return fmt.Errorf("policy %s already exists", policy.Name)
	}
	m.policies[policy.Name] = policy
	m.invalidateCache()
	return nil
}

func (m *AuthManager) RemovePolicy(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.policies, name)
	m.invalidateCache()
}

func (m *AuthManager) GetPolicy(name string) (*AuthPolicy, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	p, ok := m.policies[name]
	return p, ok
}

func (m *AuthManager) AddRole(policyName string, role *Role) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return fmt.Errorf("policy %s not found", policyName)
	}

	policy.Roles[role.Name] = role
	m.invalidateCache()
	return nil
}

func (m *AuthManager) RemoveRole(policyName, roleName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return fmt.Errorf("policy %s not found", policyName)
	}

	delete(policy.Roles, roleName)
	m.invalidateCache()
	return nil
}

func (m *AuthManager) AddUser(policyName string, user *User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return fmt.Errorf("policy %s not found", policyName)
	}

	policy.Users[user.ID] = user
	m.invalidateCache()
	return nil
}

func (m *AuthManager) RemoveUser(policyName, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return fmt.Errorf("policy %s not found", policyName)
	}

	delete(policy.Users, userID)
	m.invalidateCache()
	return nil
}

func (m *AuthManager) GetUser(policyName, userID string) (*User, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return nil, false
	}

	user, exists := policy.Users[userID]
	return user, exists
}

func (m *AuthManager) AssignRole(policyName, userID, roleName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return fmt.Errorf("policy %s not found", policyName)
	}

	user, exists := policy.Users[userID]
	if !exists {
		return fmt.Errorf("user %s not found", userID)
	}

	if _, roleExists := policy.Roles[roleName]; !roleExists {
		return fmt.Errorf("role %s not found", roleName)
	}

	for _, r := range user.Roles {
		if r == roleName {
			return nil
		}
	}

	user.Roles = append(user.Roles, roleName)
	m.invalidateCache()
	return nil
}

func (m *AuthManager) RevokeRole(policyName, userID, roleName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return fmt.Errorf("policy %s not found", policyName)
	}

	user, exists := policy.Users[userID]
	if !exists {
		return fmt.Errorf("user %s not found", userID)
	}

	for i, r := range user.Roles {
		if r == roleName {
			user.Roles = append(user.Roles[:i], user.Roles[i+1:]...)
			m.invalidateCache()
			return nil
		}
	}

	return nil
}

func (m *AuthManager) GetUserRoles(policyName, userID string) ([]*Role, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	policy, ok := m.policies[policyName]
	if !ok {
		return nil, fmt.Errorf("policy %s not found", policyName)
	}

	user, exists := policy.Users[userID]
	if !exists {
		return nil, fmt.Errorf("user %s not found", userID)
	}

	var roles []*Role
	for _, roleName := range user.Roles {
		if role, ok := m.getRoleWithInheritance(policy, roleName, make(map[string]bool)); ok {
			roles = append(roles, role)
		}
	}
	return roles, nil
}

func (m *AuthManager) getRoleWithInheritance(policy *AuthPolicy, roleName string, visited map[string]bool) (*Role, bool) {
	if visited[roleName] {
		return nil, false
	}
	visited[roleName] = true

	role, exists := policy.Roles[roleName]
	if !exists {
		return nil, false
	}

	if len(role.Inherits) == 0 {
		return role, true
	}

	merged := &Role{
		Name:        role.Name,
		Permissions: make([]*Permission, len(role.Permissions)),
		Inherits:    role.Inherits,
	}
	copy(merged.Permissions, role.Permissions)

	for _, parentName := range role.Inherits {
		if parent, ok := m.getRoleWithInheritance(policy, parentName, visited); ok {
			merged.Permissions = append(merged.Permissions, parent.Permissions...)
		}
	}

	return merged, true
}

func (m *AuthManager) AuthorizeQuery(qc *QueryContext, fq *FederatedQuery) error {
	if qc == nil || qc.UserID == "" {
		return fmt.Errorf("authentication required: user id is empty")
	}

	policyName := m.defaultPolicy
	if policyName == "" {
		policyName = "default"
	}

	user, ok := m.GetUser(policyName, qc.UserID)
	if !ok {
		return fmt.Errorf("access denied: user %s not found", qc.UserID)
	}

	if !user.Active {
		return fmt.Errorf("access denied: user %s is disabled", qc.UserID)
	}

	if len(user.Roles) == 0 {
		return fmt.Errorf("access denied: user %s has no assigned roles", qc.UserID)
	}

	if m.strictMode {
		for _, sq := range fq.SubQueries {
			if err := m.authorizeSubQuery(policyName, user, sq); err != nil {
				return err
			}
		}
	} else {
		hasAnyPermission := false
		for _, roleName := range user.Roles {
			if roleName == "admin" || roleName == "reader" || roleName == "writer" {
				hasAnyPermission = true
				break
			}
		}
		if !hasAnyPermission {
			return fmt.Errorf("access denied: user %s has no valid roles for this operation")
		}
	}

	return nil
}

func (m *AuthManager) authorizeSubQuery(policyName string, user *User, sq *SubQuery) error {
	resources := []string{
		fmt.Sprintf("%s.%s.%s", sq.Source, sq.Database, sq.Table),
		fmt.Sprintf("%s.%s", sq.Database, sq.Table),
		sq.Table,
		fmt.Sprintf("%s.*.*", sq.Source),
		"*",
	}

	denied := false
	allowed := false
	var denyReason string

	for _, resource := range resources {
		for _, roleName := range user.Roles {
			role, ok := m.getRoleWithInheritance(m.policies[policyName], roleName, make(map[string]bool))
			if !ok {
				continue
			}

			for _, perm := range role.Permissions {
				if m.matchResource(perm.Resource, resource) && m.matchAction(perm.Action, "SELECT") {
					if perm.Effect == "deny" {
						denied = true
						denyReason = fmt.Sprintf("explicit deny on resource %s by role %s", resource, roleName)
					} else if perm.Effect == "allow" {
						allowed = true
					}
				}
			}
		}
	}

	if denied {
		return fmt.Errorf("access denied: %s", denyReason)
	}

	if !allowed {
		return fmt.Errorf("access denied: no permission to access table %s (source: %s, database: %s)",
			sq.Table, sq.Source, sq.Database)
	}

	return nil
}

func (m *AuthManager) matchResource(pattern, resource string) bool {
	if pattern == "*" {
		return true
	}

	patternParts := make([]string, 0)
	current := ""
	for _, ch := range pattern {
		if ch == '*' {
			if current != "" {
				patternParts = append(patternParts, "LITERAL:"+current)
				current = ""
			}
			patternParts = append(patternParts, "WILDCARD")
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		patternParts = append(patternParts, "LITERAL:"+current)
	}

	return matchPatternParts(patternParts, resource)
}

func matchPatternParts(parts []string, resource string) bool {
	if len(parts) == 0 {
		return resource == ""
	}

	if parts[0] == "WILDCARD" {
		remaining := parts[1:]
		if len(remaining) == 0 {
			return true
		}
		for i := 0; i <= len(resource); i++ {
			if matchPatternParts(remaining, resource[i:]) {
				return true
			}
		}
		return false
	}

	if len(parts[0]) > 8 && parts[0][:8] == "LITERAL:" {
		literal := parts[0][8:]
		if len(resource) >= len(literal) && resource[:len(literal)] == literal {
			return matchPatternParts(parts[1:], resource[len(literal):])
		}
		return false
	}

	return false
}

func (m *AuthManager) matchAction(pattern, action string) bool {
	if pattern == "*" {
		return true
	}

	patternActions := splitActions(pattern)
	for _, pa := range patternActions {
		if stringsEqualFold(pa, action) {
			return true
		}
	}

	return false
}

func splitActions(s string) []string {
	result := make([]string, 0)
	current := ""
	for _, ch := range s {
		if ch == ',' {
			result = append(result, current)
			current = ""
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func stringsEqualFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if ca >= 'A' && ca <= 'Z' {
			ca += 32
		}
		if cb >= 'A' && cb <= 'Z' {
			cb += 32
		}
		if ca != cb {
			return false
		}
	}
	return true
}

func (m *AuthManager) CheckPermission(userID, action, resource string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	policyName := m.defaultPolicy
	if policyName == "" {
		policyName = "default"
	}

	policy, ok := m.policies[policyName]
	if !ok {
		return false
	}

	user, exists := policy.Users[userID]
	if !exists || !user.Active {
		return false
	}

	for _, roleName := range user.Roles {
		role, ok := m.getRoleWithInheritance(policy, roleName, make(map[string]bool))
		if !ok {
			continue
		}

		for _, perm := range role.Permissions {
			if m.matchResource(perm.Resource, resource) && m.matchAction(perm.Action, action) {
				return perm.Effect == "allow"
			}
		}
	}

	return false
}

func (m *AuthManager) GetUserPermissions(policyName, userID string) ([]*Permission, error) {
	roles, err := m.GetUserRoles(policyName, userID)
	if err != nil {
		return nil, err
	}

	var perms []*Permission
	for _, role := range roles {
		perms = append(perms, role.Permissions...)
	}
	return perms, nil
}

func (m *AuthManager) invalidateCache() {
	m.roleCache = make(map[string]*Role)
	m.userCache = make(map[string]*User)
	m.lastRefresh = time.Now()
}

func (m *AuthManager) RefreshCache() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.invalidateCache()
}

func (m *AuthManager) SetStrictMode(strict bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.strictMode = strict
}

type AuthContext struct {
	UserID   string
	Roles    []string
	Groups   []string
	Policy   string
	Scopes   []string
}

func (m *AuthManager) CreateAuthContext(qc *QueryContext) *AuthContext {
	ctx := &AuthContext{
		UserID: qc.UserID,
		Roles:  qc.Roles,
		Policy: m.defaultPolicy,
	}

	if ctx.Policy == "" {
		ctx.Policy = "default"
	}

	if user, ok := m.GetUser(ctx.Policy, qc.UserID); ok {
		ctx.Roles = user.Roles
		ctx.Groups = user.Groups
	}

	return ctx
}

type AuditLog struct {
	Timestamp time.Time
	UserID    string
	Query     string
	Action    string
	Resources []string
	Allowed   bool
	Reason    string
}

type AuditLogger struct {
	logs []*AuditLog
	mu   sync.Mutex
}

func NewAuditLogger() *AuditLogger {
	return &AuditLogger{
		logs: make([]*AuditLog, 0),
	}
}

func (l *AuditLogger) Log(userID, query, action string, resources []string, allowed bool, reason string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.logs = append(l.logs, &AuditLog{
		Timestamp: time.Now(),
		UserID:    userID,
		Query:     query,
		Action:    action,
		Resources: resources,
		Allowed:   allowed,
		Reason:    reason,
	})
}

func (l *AuditLogger) GetLogs(limit int) []*AuditLog {
	l.mu.Lock()
	defer l.mu.Unlock()

	if limit <= 0 || limit >= len(l.logs) {
		result := make([]*AuditLog, len(l.logs))
		copy(result, l.logs)
		return result
	}

	start := len(l.logs) - limit
	result := make([]*AuditLog, limit)
	copy(result, l.logs[start:])
	return result
}

func (l *AuditLogger) Clear() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.logs = make([]*AuditLog, 0)
}

type AuthWithAudit struct {
	*AuthManager
	auditLogger *AuditLogger
}

func NewAuthWithAudit(audit *AuditLogger, opts ...AuthOption) *AuthWithAudit {
	return &AuthWithAudit{
		AuthManager: NewAuthManager(opts...),
		auditLogger: audit,
	}
}

func (a *AuthWithAudit) AuthorizeQuery(qc *QueryContext, fq *FederatedQuery) error {
	err := a.AuthManager.AuthorizeQuery(qc, fq)

	var resources []string
	for _, sq := range fq.SubQueries {
		resources = append(resources, fmt.Sprintf("%s.%s.%s", sq.Source, sq.Database, sq.Table))
	}

	allowed := err == nil
	reason := ""
	if err != nil {
		reason = err.Error()
	}

	a.auditLogger.Log(qc.UserID, "", "SELECT", resources, allowed, reason)

	return err
}

func (a *AuthWithAudit) GetAuditLogs(limit int) []*AuditLog {
	return a.auditLogger.GetLogs(limit)
}

type PermissionChecker struct {
	manager *AuthManager
}

func NewPermissionChecker(manager *AuthManager) *PermissionChecker {
	return &PermissionChecker{
		manager: manager,
	}
}

func (c *PermissionChecker) CanSelect(ctx context.Context, userID, source, database, table string) bool {
	resource := fmt.Sprintf("%s.%s.%s", source, database, table)
	return c.manager.CheckPermission(userID, "SELECT", resource)
}

func (c *PermissionChecker) CanInsert(ctx context.Context, userID, source, database, table string) bool {
	resource := fmt.Sprintf("%s.%s.%s", source, database, table)
	return c.manager.CheckPermission(userID, "INSERT", resource)
}

func (c *PermissionChecker) CanUpdate(ctx context.Context, userID, source, database, table string) bool {
	resource := fmt.Sprintf("%s.%s.%s", source, database, table)
	return c.manager.CheckPermission(userID, "UPDATE", resource)
}

func (c *PermissionChecker) CanDelete(ctx context.Context, userID, source, database, table string) bool {
	resource := fmt.Sprintf("%s.%s.%s", source, database, table)
	return c.manager.CheckPermission(userID, "DELETE", resource)
}
