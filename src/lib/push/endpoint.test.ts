import { describe, expect, it } from 'vitest';

import { isAllowedPushEndpoint } from './endpoint';

describe('isAllowedPushEndpoint', () => {
  it('accepts the push services a browser subscription really returns', () => {
    const real = [
      // Chrome, Edge, Android
      'https://fcm.googleapis.com/fcm/send/abc123',
      // the wider FCM family
      'https://fcm.push.googleapis.com/fcm/send/abc123',
      // Firefox autopush
      'https://updates.push.services.mozilla.com/wpush/v2/abc123',
      'https://push.services.mozilla.com/wpush/v2/abc123',
      // Safari and iOS
      'https://web.push.apple.com/QxYx-z-x',
    ];

    for (const endpoint of real) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it('accepts an https URL on an allowed subdomain', () => {
    expect(isAllowedPushEndpoint('https://a.b.push.services.mozilla.com/wpush/v2/x')).toBe(true);
  });

  it('accepts an explicit :443 port, which is the same origin', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:443/fcm/send/abc123')).toBe(true);
  });

  it('refuses anything that is not https', () => {
    const plaintext = [
      'http://fcm.googleapis.com/fcm/send/abc123',
      'ftp://fcm.googleapis.com/fcm/send/abc123',
      'javascript:alert(1)',
      'data:text/plain,hi',
    ];

    for (const endpoint of plaintext) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it('refuses the cloud metadata endpoint that makes this SSRF worth closing', () => {
    expect(isAllowedPushEndpoint('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedPushEndpoint('http://[::1]:8080/admin')).toBe(false);
    expect(isAllowedPushEndpoint('http://localhost:3000/')).toBe(false);
    expect(isAllowedPushEndpoint('http://10.0.0.5/internal')).toBe(false);
  });

  it('refuses userinfo, so the visible host cannot be used to disguise another', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com@evil.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://user:pass@evil.example/x')).toBe(false);
  });

  it('refuses a hostname that merely ends with the allowed text', () => {
    const lookalikes = [
      // ends with the characters, but the registrable domain is the attacker's
      'https://fcm.googleapis.com.attacker.example/fcm/send/abc123',
      'https://evil-fcm.googleapis.com.attacker.example/x',
      'https://updates.push.services.mozilla.com.attacker.example/x',
      'https://web.push.apple.com.attacker.example/x',
      // right characters, wrong DNS label boundary
      'https://notfcm.googleapis.com/x',
      'https://xpush.googleapis.com.attacker.example/y',
      // a trailing dot is a distinct name and is not on the list
      'https://fcm.googleapis.com./fcm/send/abc123',
      // the attacker does not even need a domain, a bare IP works the same way
      'https://2130706433/',
    ];

    for (const endpoint of lookalikes) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });

  it('refuses an allowed host on a non-standard port', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/abc123')).toBe(false);
  });

  it('refuses Firefox autopush staging, which is not a browser a user runs', () => {
    expect(isAllowedPushEndpoint('https://updates-autopush.stage.mozaws.net/wpush/v2/x')).toBe(false);
  });

  it('refuses anything unparseable rather than guessing', () => {
    const junk = ['', '   ', 'not a url', '//fcm.googleapis.com/x', 'fcm.googleapis.com', '/relative'];

    for (const endpoint of junk) {
      expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });
});