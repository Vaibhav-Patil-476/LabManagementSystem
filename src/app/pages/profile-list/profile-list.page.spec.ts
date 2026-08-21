import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProfileListPage } from './profile-list.page';

describe('ProfileListPage', () => {
  let component: ProfileListPage;
  let fixture: ComponentFixture<ProfileListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ProfileListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
