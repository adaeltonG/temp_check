'use client';

import { useRef, useState } from 'react';
import { api } from '../lib';

export default function AddUser({ onCreated }) {
  const dialog = useRef(null);
  const form = useRef(null);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const user = await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          firstName: data.get('firstName').trim(),
          email: data.get('email').trim(),
          password: data.get('password'),
          isAdmin: data.get('isAdmin') === 'on',
        }),
      });
      form.current.reset();
      dialog.current.close();
      onCreated(
        `${user.firstName} (${user.email}) was added${user.isAdmin ? ' as an admin' : ''}.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="add-user-button"
        disabled={saving}
        onClick={() => {
          setError('');
          dialog.current.showModal();
        }}
      >
        <span aria-hidden="true">+</span> Add User
      </button>
      <dialog
        ref={dialog}
        className="add-user-dialog"
        aria-labelledby="add-user-title"
        aria-describedby="add-user-description"
        onClose={() => {
          form.current.reset();
          form.current.elements.password.setCustomValidity('');
          setError('');
        }}
      >
        <h2 id="add-user-title">Add User</h2>
        <p id="add-user-description">Create an account for the inspection portal.</p>
        <form ref={form} onSubmit={submit} aria-busy={saving}>
          <fieldset disabled={saving}>
            <label className="add-user-field" htmlFor="new-user-name">
              First name
              <input
                id="new-user-name"
                name="firstName"
                autoComplete="given-name"
                required
                maxLength={80}
                autoFocus
              />
            </label>
            <label className="add-user-field" htmlFor="new-user-email">
              Email
              <input
                id="new-user-email"
                name="email"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
              />
            </label>
            <label className="add-user-field" htmlFor="new-user-password">
              Password
              <input
                id="new-user-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                aria-describedby="new-user-password-hint"
                onInput={(event) => {
                  event.currentTarget.setCustomValidity(
                    new TextEncoder().encode(event.currentTarget.value).length > 72
                      ? 'Use a password of 72 bytes or fewer (some characters use more than one byte).'
                      : '',
                  );
                }}
              />
              <span className="field-hint" id="new-user-password-hint">
                At least 8 characters. Maximum 72 bytes.
              </span>
            </label>
            <div className="add-user-admin">
              <input
                id="new-user-admin"
                name="isAdmin"
                type="checkbox"
                aria-describedby="new-user-admin-hint"
              />
              <div>
                <label htmlFor="new-user-admin">Admin</label>
                <p id="new-user-admin-hint">Can add users and assign admin access.</p>
              </div>
            </div>
          </fieldset>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="add-user-actions">
            <button type="button" onClick={() => dialog.current.close()}>
              Cancel
            </button>
            <button type="submit" className="add-user-button" disabled={saving}>
              {saving ? 'Adding user…' : 'Add User'}
            </button>
          </div>
          <span className="add-user-status" role="status">
            {saving ? 'Creating account…' : ''}
          </span>
        </form>
      </dialog>
    </>
  );
}
