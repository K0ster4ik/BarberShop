"use client";

import { Plus } from "lucide-react";
import { FormDialog } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { MasterProfileForm } from "./master-profile-form";

export function NewMasterButton() {
  return (
    <FormDialog
      title="Новый мастер"
      description="После сохранения откроется карточка: там можно добавить фото, услуги и график."
      trigger={
        <Button>
          <Plus aria-hidden /> Мастер
        </Button>
      }
    >
      {(close) => <MasterProfileForm masterId={null} onDone={close} />}
    </FormDialog>
  );
}
