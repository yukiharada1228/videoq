import { relations } from "drizzle-orm/relations";
import { djangoContentType, authPermission, authGroup, authGroupPermissions, appUser, appUserGroups, appUserUserPermissions, appVideogroup, appVideogroupmember, appVideo, djangoAdminLog, appChatlog, appTag, appVideotag, appAccountdeletionrequest, appUserapikey, appDocument, appDocumentgroupmember, appDocumenttag, appGroupevaluationsnapshot, appChatlogevaluation, oauth2ProviderRefreshtoken, oauth2ProviderAccesstoken, oauth2ProviderApplication, oauth2ProviderIdtoken, oauth2ProviderGrant, oauth2ProviderDevicegrant, appPlogbuildjob, appPlogsummarynode, appPlogconcept, appPlogedge, appPloglearningobject, appLearnerconceptstate } from "./tables";

export const authPermissionRelations = relations(authPermission, ({one, many}) => ({
	djangoContentType: one(djangoContentType, {
		fields: [authPermission.contentTypeId],
		references: [djangoContentType.id]
	}),
	authGroupPermissions: many(authGroupPermissions),
	appUserUserPermissions: many(appUserUserPermissions),
}));

export const djangoContentTypeRelations = relations(djangoContentType, ({many}) => ({
	authPermissions: many(authPermission),
	djangoAdminLogs: many(djangoAdminLog),
}));

export const authGroupPermissionsRelations = relations(authGroupPermissions, ({one}) => ({
	authGroup: one(authGroup, {
		fields: [authGroupPermissions.groupId],
		references: [authGroup.id]
	}),
	authPermission: one(authPermission, {
		fields: [authGroupPermissions.permissionId],
		references: [authPermission.id]
	}),
}));

export const authGroupRelations = relations(authGroup, ({many}) => ({
	authGroupPermissions: many(authGroupPermissions),
	appUserGroups: many(appUserGroups),
}));

export const appUserGroupsRelations = relations(appUserGroups, ({one}) => ({
	appUser: one(appUser, {
		fields: [appUserGroups.userId],
		references: [appUser.id]
	}),
	authGroup: one(authGroup, {
		fields: [appUserGroups.groupId],
		references: [authGroup.id]
	}),
}));

export const appUserRelations = relations(appUser, ({many}) => ({
	appUserGroups: many(appUserGroups),
	appUserUserPermissions: many(appUserUserPermissions),
	djangoAdminLogs: many(djangoAdminLog),
	appVideos: many(appVideo),
	appChatlogs: many(appChatlog),
	appVideogroups: many(appVideogroup),
	appTags: many(appTag),
	appAccountdeletionrequests: many(appAccountdeletionrequest),
	appUserapikeys: many(appUserapikey),
	appDocuments: many(appDocument),
	appGroupevaluationsnapshots: many(appGroupevaluationsnapshot),
	oauth2ProviderAccesstokens: many(oauth2ProviderAccesstoken),
	oauth2ProviderIdtokens: many(oauth2ProviderIdtoken),
	oauth2ProviderGrants: many(oauth2ProviderGrant),
	oauth2ProviderDevicegrants: many(oauth2ProviderDevicegrant),
	oauth2ProviderApplications: many(oauth2ProviderApplication),
	oauth2ProviderRefreshtokens: many(oauth2ProviderRefreshtoken),
	appLearnerconceptstates: many(appLearnerconceptstate),
}));

export const appUserUserPermissionsRelations = relations(appUserUserPermissions, ({one}) => ({
	appUser: one(appUser, {
		fields: [appUserUserPermissions.userId],
		references: [appUser.id]
	}),
	authPermission: one(authPermission, {
		fields: [appUserUserPermissions.permissionId],
		references: [authPermission.id]
	}),
}));

export const appVideogroupmemberRelations = relations(appVideogroupmember, ({one}) => ({
	appVideogroup: one(appVideogroup, {
		fields: [appVideogroupmember.groupId],
		references: [appVideogroup.id]
	}),
	appVideo: one(appVideo, {
		fields: [appVideogroupmember.videoId],
		references: [appVideo.id]
	}),
}));

export const appVideogroupRelations = relations(appVideogroup, ({one, many}) => ({
	appVideogroupmembers: many(appVideogroupmember),
	appChatlogs: many(appChatlog),
	appUser: one(appUser, {
		fields: [appVideogroup.userId],
		references: [appUser.id]
	}),
	appDocumentgroupmembers: many(appDocumentgroupmember),
	appGroupevaluationsnapshots: many(appGroupevaluationsnapshot),
}));

export const appVideoRelations = relations(appVideo, ({one, many}) => ({
	appVideogroupmembers: many(appVideogroupmember),
	appUser: one(appUser, {
		fields: [appVideo.userId],
		references: [appUser.id]
	}),
	appVideotags: many(appVideotag),
	appPlogbuildjobs: many(appPlogbuildjob),
	appPlogsummarynodes: many(appPlogsummarynode),
	appPlogconcepts: many(appPlogconcept),
	appPlogedges: many(appPlogedge),
}));

export const djangoAdminLogRelations = relations(djangoAdminLog, ({one}) => ({
	djangoContentType: one(djangoContentType, {
		fields: [djangoAdminLog.contentTypeId],
		references: [djangoContentType.id]
	}),
	appUser: one(appUser, {
		fields: [djangoAdminLog.userId],
		references: [appUser.id]
	}),
}));

export const appChatlogRelations = relations(appChatlog, ({one, many}) => ({
	appUser: one(appUser, {
		fields: [appChatlog.userId],
		references: [appUser.id]
	}),
	appVideogroup: one(appVideogroup, {
		fields: [appChatlog.groupId],
		references: [appVideogroup.id]
	}),
	appChatlogevaluations: many(appChatlogevaluation),
}));

export const appTagRelations = relations(appTag, ({one, many}) => ({
	appUser: one(appUser, {
		fields: [appTag.userId],
		references: [appUser.id]
	}),
	appVideotags: many(appVideotag),
	appDocumenttags: many(appDocumenttag),
}));

export const appVideotagRelations = relations(appVideotag, ({one}) => ({
	appTag: one(appTag, {
		fields: [appVideotag.tagId],
		references: [appTag.id]
	}),
	appVideo: one(appVideo, {
		fields: [appVideotag.videoId],
		references: [appVideo.id]
	}),
}));

export const appAccountdeletionrequestRelations = relations(appAccountdeletionrequest, ({one}) => ({
	appUser: one(appUser, {
		fields: [appAccountdeletionrequest.userId],
		references: [appUser.id]
	}),
}));

export const appUserapikeyRelations = relations(appUserapikey, ({one}) => ({
	appUser: one(appUser, {
		fields: [appUserapikey.userId],
		references: [appUser.id]
	}),
}));

export const appDocumentRelations = relations(appDocument, ({one, many}) => ({
	appUser: one(appUser, {
		fields: [appDocument.userId],
		references: [appUser.id]
	}),
	appDocumentgroupmembers: many(appDocumentgroupmember),
	appDocumenttags: many(appDocumenttag),
}));

export const appDocumentgroupmemberRelations = relations(appDocumentgroupmember, ({one}) => ({
	appDocument: one(appDocument, {
		fields: [appDocumentgroupmember.documentId],
		references: [appDocument.id]
	}),
	appVideogroup: one(appVideogroup, {
		fields: [appDocumentgroupmember.groupId],
		references: [appVideogroup.id]
	}),
}));

export const appDocumenttagRelations = relations(appDocumenttag, ({one}) => ({
	appDocument: one(appDocument, {
		fields: [appDocumenttag.documentId],
		references: [appDocument.id]
	}),
	appTag: one(appTag, {
		fields: [appDocumenttag.tagId],
		references: [appTag.id]
	}),
}));

export const appGroupevaluationsnapshotRelations = relations(appGroupevaluationsnapshot, ({one}) => ({
	appVideogroup: one(appVideogroup, {
		fields: [appGroupevaluationsnapshot.groupId],
		references: [appVideogroup.id]
	}),
	appUser: one(appUser, {
		fields: [appGroupevaluationsnapshot.userId],
		references: [appUser.id]
	}),
}));

export const appChatlogevaluationRelations = relations(appChatlogevaluation, ({one}) => ({
	appChatlog: one(appChatlog, {
		fields: [appChatlogevaluation.chatLogId],
		references: [appChatlog.id]
	}),
}));

export const oauth2ProviderAccesstokenRelations = relations(oauth2ProviderAccesstoken, ({one, many}) => ({
	oauth2ProviderRefreshtoken: one(oauth2ProviderRefreshtoken, {
		fields: [oauth2ProviderAccesstoken.sourceRefreshTokenId],
		references: [oauth2ProviderRefreshtoken.id],
		relationName: "oauth2ProviderAccesstoken_sourceRefreshTokenId_oauth2ProviderRefreshtoken_id"
	}),
	oauth2ProviderApplication: one(oauth2ProviderApplication, {
		fields: [oauth2ProviderAccesstoken.applicationId],
		references: [oauth2ProviderApplication.id]
	}),
	appUser: one(appUser, {
		fields: [oauth2ProviderAccesstoken.userId],
		references: [appUser.id]
	}),
	oauth2ProviderIdtoken: one(oauth2ProviderIdtoken, {
		fields: [oauth2ProviderAccesstoken.idTokenId],
		references: [oauth2ProviderIdtoken.id]
	}),
	oauth2ProviderRefreshtokens: many(oauth2ProviderRefreshtoken, {
		relationName: "oauth2ProviderRefreshtoken_accessTokenId_oauth2ProviderAccesstoken_id"
	}),
}));

export const oauth2ProviderRefreshtokenRelations = relations(oauth2ProviderRefreshtoken, ({one, many}) => ({
	oauth2ProviderAccesstokens: many(oauth2ProviderAccesstoken, {
		relationName: "oauth2ProviderAccesstoken_sourceRefreshTokenId_oauth2ProviderRefreshtoken_id"
	}),
	oauth2ProviderAccesstoken: one(oauth2ProviderAccesstoken, {
		fields: [oauth2ProviderRefreshtoken.accessTokenId],
		references: [oauth2ProviderAccesstoken.id],
		relationName: "oauth2ProviderRefreshtoken_accessTokenId_oauth2ProviderAccesstoken_id"
	}),
	oauth2ProviderApplication: one(oauth2ProviderApplication, {
		fields: [oauth2ProviderRefreshtoken.applicationId],
		references: [oauth2ProviderApplication.id]
	}),
	appUser: one(appUser, {
		fields: [oauth2ProviderRefreshtoken.userId],
		references: [appUser.id]
	}),
}));

export const oauth2ProviderApplicationRelations = relations(oauth2ProviderApplication, ({one, many}) => ({
	oauth2ProviderAccesstokens: many(oauth2ProviderAccesstoken),
	oauth2ProviderIdtokens: many(oauth2ProviderIdtoken),
	oauth2ProviderGrants: many(oauth2ProviderGrant),
	appUser: one(appUser, {
		fields: [oauth2ProviderApplication.userId],
		references: [appUser.id]
	}),
	oauth2ProviderRefreshtokens: many(oauth2ProviderRefreshtoken),
}));

export const oauth2ProviderIdtokenRelations = relations(oauth2ProviderIdtoken, ({one, many}) => ({
	oauth2ProviderAccesstokens: many(oauth2ProviderAccesstoken),
	oauth2ProviderApplication: one(oauth2ProviderApplication, {
		fields: [oauth2ProviderIdtoken.applicationId],
		references: [oauth2ProviderApplication.id]
	}),
	appUser: one(appUser, {
		fields: [oauth2ProviderIdtoken.userId],
		references: [appUser.id]
	}),
}));

export const oauth2ProviderGrantRelations = relations(oauth2ProviderGrant, ({one}) => ({
	oauth2ProviderApplication: one(oauth2ProviderApplication, {
		fields: [oauth2ProviderGrant.applicationId],
		references: [oauth2ProviderApplication.id]
	}),
	appUser: one(appUser, {
		fields: [oauth2ProviderGrant.userId],
		references: [appUser.id]
	}),
}));

export const oauth2ProviderDevicegrantRelations = relations(oauth2ProviderDevicegrant, ({one}) => ({
	appUser: one(appUser, {
		fields: [oauth2ProviderDevicegrant.userId],
		references: [appUser.id]
	}),
}));

export const appPlogbuildjobRelations = relations(appPlogbuildjob, ({one}) => ({
	appVideo: one(appVideo, {
		fields: [appPlogbuildjob.videoId],
		references: [appVideo.id]
	}),
}));

export const appPlogsummarynodeRelations = relations(appPlogsummarynode, ({one, many}) => ({
	appPlogsummarynode: one(appPlogsummarynode, {
		fields: [appPlogsummarynode.parentId],
		references: [appPlogsummarynode.id],
		relationName: "appPlogsummarynode_parentId_appPlogsummarynode_id"
	}),
	appPlogsummarynodes: many(appPlogsummarynode, {
		relationName: "appPlogsummarynode_parentId_appPlogsummarynode_id"
	}),
	appVideo: one(appVideo, {
		fields: [appPlogsummarynode.videoId],
		references: [appVideo.id]
	}),
}));

export const appPlogconceptRelations = relations(appPlogconcept, ({one, many}) => ({
	appVideo: one(appVideo, {
		fields: [appPlogconcept.videoId],
		references: [appVideo.id]
	}),
	appPlogedges_sourceId: many(appPlogedge, {
		relationName: "appPlogedge_sourceId_appPlogconcept_id"
	}),
	appPlogedges_targetId: many(appPlogedge, {
		relationName: "appPlogedge_targetId_appPlogconcept_id"
	}),
	appPloglearningobjects: many(appPloglearningobject),
	appLearnerconceptstates: many(appLearnerconceptstate),
}));

export const appPlogedgeRelations = relations(appPlogedge, ({one}) => ({
	appPlogconcept_sourceId: one(appPlogconcept, {
		fields: [appPlogedge.sourceId],
		references: [appPlogconcept.id],
		relationName: "appPlogedge_sourceId_appPlogconcept_id"
	}),
	appPlogconcept_targetId: one(appPlogconcept, {
		fields: [appPlogedge.targetId],
		references: [appPlogconcept.id],
		relationName: "appPlogedge_targetId_appPlogconcept_id"
	}),
	appVideo: one(appVideo, {
		fields: [appPlogedge.videoId],
		references: [appVideo.id]
	}),
}));

export const appPloglearningobjectRelations = relations(appPloglearningobject, ({one}) => ({
	appPlogconcept: one(appPlogconcept, {
		fields: [appPloglearningobject.conceptId],
		references: [appPlogconcept.id]
	}),
}));

export const appLearnerconceptstateRelations = relations(appLearnerconceptstate, ({one}) => ({
	appPlogconcept: one(appPlogconcept, {
		fields: [appLearnerconceptstate.conceptId],
		references: [appPlogconcept.id]
	}),
	appUser: one(appUser, {
		fields: [appLearnerconceptstate.userId],
		references: [appUser.id]
	}),
}));