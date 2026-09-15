#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Security/Security.h>
#include "native_darwin.h"
static NSMutableArray<NSNumber *> *commands;
static BOOL sleeping=NO;
static NSStatusItem *statusItem;
static NSMenuItem *statusLine;
@interface NemuMenu : NSObject
-(void)action:(NSMenuItem *)sender;
@end
@implementation NemuMenu
-(void)action:(NSMenuItem *)sender { [commands addObject:@(sender.tag)]; }
@end
static NemuMenu *delegate;
void nemu_init(void) {
 commands=[NSMutableArray new];[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
 delegate=[NemuMenu new];statusItem=[[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];statusItem.button.title=@"ねむ";
 NSMenu *menu=[NSMenu new];statusLine=[[NSMenuItem alloc] initWithTitle:@"● recording" action:nil keyEquivalent:@""];[menu addItem:statusLine];[menu addItem:[NSMenuItem separatorItem]];
 NSArray *titles=@[@"Open nemu",@"Sync now",@"Pause / Resume",@"Pair this browser",@"Quit"];
 for(int i=0;i<titles.count;i++){NSMenuItem *item=[[NSMenuItem alloc] initWithTitle:titles[i] action:@selector(action:) keyEquivalent:@""];item.target=delegate;item.tag=i+1;[menu addItem:item];}statusItem.menu=menu;
 NSNotificationCenter *nc=[[NSWorkspace sharedWorkspace] notificationCenter];
 [nc addObserverForName:NSWorkspaceWillSleepNotification object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *n){sleeping=YES;[commands addObject:@10];}];
 [nc addObserverForName:NSWorkspaceDidWakeNotification object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *n){sleeping=NO;[commands addObject:@11];}];
 [nc addObserverForName:NSWorkspaceSessionDidResignActiveNotification object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *n){sleeping=YES;[commands addObject:@10];}];
 [nc addObserverForName:NSWorkspaceSessionDidBecomeActiveNotification object:nil queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *n){sleeping=NO;[commands addObject:@11];}];
 [NSApp finishLaunching];
}
int nemu_pump(void) { @autoreleasepool { NSEvent *ev;while((ev=[NSApp nextEventMatchingMask:NSEventMaskAny untilDate:[NSDate distantPast] inMode:NSDefaultRunLoopMode dequeue:YES])){[NSApp sendEvent:ev];}[[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];int c=commands.count?[commands[0] intValue]:0;if(commands.count)[commands removeObjectAtIndex:0];return c;} }
char *nemu_sample(void) { @autoreleasepool {
 if(sleeping)return NULL;
 NSRunningApplication *app=[[NSWorkspace sharedWorkspace] frontmostApplication];if(!app || !app.bundleIdentifier)return NULL;
 double idle=CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateCombinedSessionState,kCGAnyInputEventType);
 NSDictionary *v=@{@"app_name":app.localizedName?:app.bundleIdentifier,@"bundle_id":app.bundleIdentifier,@"idle":@(idle)};
 NSData *data=[NSJSONSerialization dataWithJSONObject:v options:0 error:nil];return strdup([[ [NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] UTF8String]);
} }
void nemu_status(const char *text){statusLine.title=[NSString stringWithUTF8String:text];}
static NSMutableDictionary *query(const char *key){return [@{(__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword,(__bridge id)kSecAttrService:@"app.nemu.agent",(__bridge id)kSecAttrAccount:[NSString stringWithUTF8String:key]} mutableCopy];}
char *nemu_secret_read(const char *key, int *status){@autoreleasepool{NSMutableDictionary *q=query(key);q[(__bridge id)kSecReturnData]=@YES;CFTypeRef result=NULL;OSStatus s=SecItemCopyMatching((__bridge CFDictionaryRef)q,&result);*status=(int)s;if(s!=errSecSuccess)return NULL;NSData *data=CFBridgingRelease(result);return strdup([[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] UTF8String]);}}
int nemu_secret_write(const char *key,const char *value){@autoreleasepool{NSMutableDictionary *q=query(key);NSData *data=[[NSString stringWithUTF8String:value] dataUsingEncoding:NSUTF8StringEncoding];OSStatus s=SecItemUpdate((__bridge CFDictionaryRef)q,(__bridge CFDictionaryRef)@{(__bridge id)kSecValueData:data});if(s==errSecItemNotFound){q[(__bridge id)kSecValueData]=data;q[(__bridge id)kSecAttrAccessible]=(__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;s=SecItemAdd((__bridge CFDictionaryRef)q,NULL);}return (int)s;}}
void nemu_open(const char *url){[[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:[NSString stringWithUTF8String:url]]];}
